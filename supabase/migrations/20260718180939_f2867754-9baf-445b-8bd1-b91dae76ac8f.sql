
-- ============ A: SECURITY HARDENING ============

-- Fix mutable search_path on trigger fn
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Trigger-only functions: revoke public/authenticated EXECUTE (they run as triggers, not RPCs).
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_vendor_rating() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_link_customer() FROM PUBLIC, anon, authenticated;
-- Keep is_vendor_staff callable by authenticated (used inside RLS policies).

-- Tighten orders INSERT (was WITH CHECK true → could spoof another user's id)
DROP POLICY IF EXISTS "orders insert" ON public.orders;
CREATE POLICY "orders insert public"
ON public.orders FOR INSERT TO anon, authenticated
WITH CHECK (
  customer_user_id IS NULL
  OR customer_user_id = auth.uid()
);

-- Tighten orders SELECT (was USING true → leaked PII of every order)
DROP POLICY IF EXISTS "orders read" ON public.orders;
CREATE POLICY "orders read owner or staff"
ON public.orders FOR SELECT TO anon, authenticated
USING (
  (auth.uid() IS NOT NULL AND customer_user_id = auth.uid())
  OR (auth.jwt() ->> 'email' IS NOT NULL AND lower(customer_email) = lower(auth.jwt() ->> 'email'))
  OR public.is_vendor_staff(vendor_id)
);

-- Tighten order_items INSERT (must reference an order the caller could create)
DROP POLICY IF EXISTS "oi insert" ON public.order_items;
CREATE POLICY "oi insert with parent"
ON public.order_items FOR INSERT TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (o.customer_user_id IS NULL OR o.customer_user_id = auth.uid())
  )
);

-- Tighten order_items SELECT (mirror parent's visibility)
DROP POLICY IF EXISTS "oi read" ON public.order_items;
CREATE POLICY "oi read via parent"
ON public.order_items FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        (auth.uid() IS NOT NULL AND o.customer_user_id = auth.uid())
        OR (auth.jwt() ->> 'email' IS NOT NULL AND lower(o.customer_email) = lower(auth.jwt() ->> 'email'))
        OR public.is_vendor_staff(o.vendor_id)
      )
  )
);

-- Public confirmation-page access via unguessable order_code
CREATE OR REPLACE FUNCTION public.get_order_by_code(_code text)
RETURNS SETOF public.orders
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.orders WHERE order_code = upper(_code) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_order_items_by_code(_code text)
RETURNS TABLE (
  id uuid, order_id uuid, menu_item_id uuid, name text,
  unit_price_cents integer, discount_cents integer, quantity integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT oi.id, oi.order_id, oi.menu_item_id, oi.name,
         oi.unit_price_cents, oi.discount_cents, oi.quantity
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
   WHERE o.order_code = upper(_code);
$$;

GRANT EXECUTE ON FUNCTION public.get_order_by_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_items_by_code(text) TO anon, authenticated;

-- ============ B: COMMISSION ============

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS commission_pct numeric(5,2) NOT NULL DEFAULT 2.0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS commission_cents integer NOT NULL DEFAULT 0;

-- ============ C: ADMIN ROLES + VENDOR APPLICATIONS ============

DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','vendor','customer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles self read" ON public.user_roles;
CREATE POLICY "user_roles self read"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE TABLE IF NOT EXISTS public.vendor_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text NOT NULL,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  phone text,
  cuisine text NOT NULL,
  address text,
  description text,
  applicant_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  review_notes text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  approved_vendor_id uuid REFERENCES public.vendors(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.vendor_applications TO anon, authenticated;
GRANT UPDATE ON public.vendor_applications TO authenticated;
GRANT ALL ON public.vendor_applications TO service_role;

ALTER TABLE public.vendor_applications ENABLE ROW LEVEL SECURITY;

-- Anyone can submit
DROP POLICY IF EXISTS "va insert public" ON public.vendor_applications;
CREATE POLICY "va insert public"
ON public.vendor_applications FOR INSERT TO anon, authenticated
WITH CHECK (
  applicant_user_id IS NULL OR applicant_user_id = auth.uid()
);

-- Applicant reads own; admins read all
DROP POLICY IF EXISTS "va read own or admin" ON public.vendor_applications;
CREATE POLICY "va read own or admin"
ON public.vendor_applications FOR SELECT TO authenticated
USING (
  applicant_user_id = auth.uid()
  OR (auth.jwt() ->> 'email' IS NOT NULL AND lower(contact_email) = lower(auth.jwt() ->> 'email'))
  OR public.has_role(auth.uid(), 'admin')
);

-- Only admins can update (approve/reject)
DROP POLICY IF EXISTS "va update admin" ON public.vendor_applications;
CREATE POLICY "va update admin"
ON public.vendor_applications FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS va_touch_updated_at ON public.vendor_applications;
CREATE TRIGGER va_touch_updated_at
BEFORE UPDATE ON public.vendor_applications
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Approve helper: admin-only. Creates a vendor row + staff link + marks application.
CREATE OR REPLACE FUNCTION public.approve_vendor_application(
  _application_id uuid,
  _slug text,
  _brand_primary text DEFAULT '#111827',
  _service_fee_cents integer DEFAULT 50,
  _commission_pct numeric DEFAULT 2.0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.vendor_applications;
  v_vendor_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_app FROM public.vendor_applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.status <> 'pending' THEN RAISE EXCEPTION 'Already decided'; END IF;

  INSERT INTO public.vendors (
    slug, name, cuisine, description, address,
    brand_primary, service_fee_cents, commission_pct, is_active
  ) VALUES (
    _slug, v_app.business_name, v_app.cuisine, v_app.description, v_app.address,
    _brand_primary, _service_fee_cents, _commission_pct, true
  )
  RETURNING id INTO v_vendor_id;

  IF v_app.applicant_user_id IS NOT NULL THEN
    INSERT INTO public.staff (vendor_id, auth_user_id, role)
    VALUES (v_vendor_id, v_app.applicant_user_id, 'owner')
    ON CONFLICT DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_app.applicant_user_id, 'vendor')
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.vendor_applications
     SET status = 'approved',
         approved_vendor_id = v_vendor_id,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   WHERE id = _application_id;

  RETURN v_vendor_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.approve_vendor_application(uuid,text,text,integer,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_vendor_application(_application_id uuid, _notes text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  UPDATE public.vendor_applications
     SET status='rejected', review_notes=_notes,
         reviewed_by=auth.uid(), reviewed_at=now()
   WHERE id=_application_id AND status='pending';
END;
$$;
GRANT EXECUTE ON FUNCTION public.reject_vendor_application(uuid,text) TO authenticated;
