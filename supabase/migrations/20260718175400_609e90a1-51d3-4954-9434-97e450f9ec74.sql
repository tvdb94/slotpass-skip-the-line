
-- Phase 7 foundation

-- Vendors: grace window, rolling rating, updated_at
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS grace_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Orders: reminder tracking + no_show marker + customer link for history
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS no_show_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_customer_user_id_idx ON public.orders (customer_user_id);
CREATE INDEX IF NOT EXISTS orders_reminder_pending_idx
  ON public.orders (slot_id)
  WHERE status = 'paid' AND reminder_sent_at IS NULL;

-- Reviews
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- Anyone can read reviews (public trust signal)
CREATE POLICY "reviews read" ON public.reviews FOR SELECT USING (true);

-- A review can be inserted by anyone who can prove they own the paid+collected order.
-- We enforce this via a trigger below (order lookup with security definer) rather than
-- a policy referencing auth.users, so anon customers who created orders while signed out
-- cannot review, but authenticated customers whose email matches can.
CREATE POLICY "reviews insert authenticated" ON public.reviews
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.vendor_id = reviews.vendor_id
        AND o.collected_at IS NOT NULL
        AND (o.customer_user_id = auth.uid()
             OR lower(o.customer_email) = lower((auth.jwt() ->> 'email')))
    )
  );

CREATE POLICY "reviews staff delete" ON public.reviews
  FOR DELETE TO authenticated
  USING (public.is_vendor_staff(vendor_id));

-- Rolling rating trigger on vendors
CREATE OR REPLACE FUNCTION public.refresh_vendor_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := COALESCE(NEW.vendor_id, OLD.vendor_id);
  v_avg numeric;
  v_count integer;
BEGIN
  SELECT ROUND(AVG(rating)::numeric, 1), COUNT(*)
    INTO v_avg, v_count
  FROM public.reviews WHERE vendor_id = v_id;

  UPDATE public.vendors
     SET rating = COALESCE(v_avg, 4.5),
         rating_count = COALESCE(v_count, 0),
         updated_at = now()
   WHERE id = v_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS reviews_refresh_rating ON public.reviews;
CREATE TRIGGER reviews_refresh_rating
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.refresh_vendor_rating();

-- updated_at trigger for vendors
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendors_touch_updated_at ON public.vendors;
CREATE TRIGGER vendors_touch_updated_at
BEFORE UPDATE ON public.vendors
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Backfill customer_user_id on future orders by matching customer_email at insert time
CREATE OR REPLACE FUNCTION public.orders_link_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.customer_user_id IS NULL AND NEW.customer_email IS NOT NULL THEN
    SELECT id INTO NEW.customer_user_id
      FROM auth.users
     WHERE lower(email) = lower(NEW.customer_email)
     LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_link_customer_trg ON public.orders;
CREATE TRIGGER orders_link_customer_trg
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_link_customer();
