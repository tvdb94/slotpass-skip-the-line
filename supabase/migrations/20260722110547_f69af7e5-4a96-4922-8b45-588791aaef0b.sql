
-- Promo codes
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('percent','fixed','referral')),
  value_pct numeric(5,2),
  value_cents integer,
  min_subtotal_cents integer DEFAULT 0,
  max_uses integer,
  uses_count integer NOT NULL DEFAULT 0,
  vendor_id uuid REFERENCES public.vendors(id) ON DELETE CASCADE,
  owner_user_id uuid,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promo_codes_code_idx ON public.promo_codes (lower(code));
CREATE INDEX promo_codes_owner_idx ON public.promo_codes (owner_user_id);

GRANT SELECT ON public.promo_codes TO authenticated;
GRANT SELECT ON public.promo_codes TO anon;
GRANT ALL ON public.promo_codes TO service_role;

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "promo_codes owner read" ON public.promo_codes
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "promo_codes admin write" ON public.promo_codes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_promo_codes_updated_at
  BEFORE UPDATE ON public.promo_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Promo redemptions
CREATE TABLE public.promo_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  user_id uuid,
  customer_email text,
  amount_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promo_redemptions_code_idx ON public.promo_redemptions (promo_code_id);

GRANT SELECT ON public.promo_redemptions TO authenticated;
GRANT ALL ON public.promo_redemptions TO service_role;

ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "promo_redemptions admin read" ON public.promo_redemptions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR user_id = auth.uid());

-- Order columns for promo tracking
ALTER TABLE public.orders
  ADD COLUMN promo_code_id uuid REFERENCES public.promo_codes(id) ON DELETE SET NULL,
  ADD COLUMN promo_discount_cents integer NOT NULL DEFAULT 0;

-- Validate & compute a promo code discount for a given subtotal/vendor
CREATE OR REPLACE FUNCTION public.validate_promo_code(
  _code text,
  _vendor_id uuid,
  _subtotal_cents integer,
  _user_id uuid DEFAULT NULL,
  _email text DEFAULT NULL
) RETURNS TABLE(promo_code_id uuid, discount_cents integer, kind text, code text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.promo_codes;
  d integer := 0;
  used integer := 0;
BEGIN
  SELECT * INTO p FROM public.promo_codes
   WHERE lower(code) = lower(_code) AND is_active = true
   LIMIT 1;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Invalid code'; END IF;
  IF p.expires_at IS NOT NULL AND p.expires_at < now() THEN RAISE EXCEPTION 'Code expired'; END IF;
  IF p.vendor_id IS NOT NULL AND p.vendor_id <> _vendor_id THEN RAISE EXCEPTION 'Code not valid for this vendor'; END IF;
  IF p.min_subtotal_cents IS NOT NULL AND _subtotal_cents < p.min_subtotal_cents THEN
    RAISE EXCEPTION 'Subtotal below minimum';
  END IF;
  IF p.max_uses IS NOT NULL AND p.uses_count >= p.max_uses THEN RAISE EXCEPTION 'Code exhausted'; END IF;
  -- Owner may not redeem their own referral code
  IF p.owner_user_id IS NOT NULL AND _user_id IS NOT NULL AND p.owner_user_id = _user_id THEN
    RAISE EXCEPTION 'You cannot use your own referral code';
  END IF;
  -- One-per-user for referral codes
  IF p.kind = 'referral' AND _user_id IS NOT NULL THEN
    SELECT count(*) INTO used FROM public.promo_redemptions
      WHERE promo_code_id = p.id AND user_id = _user_id;
    IF used > 0 THEN RAISE EXCEPTION 'Already redeemed'; END IF;
  END IF;

  IF p.kind = 'percent' OR p.kind = 'referral' THEN
    d := round(_subtotal_cents * COALESCE(p.value_pct, 0) / 100.0);
  ELSIF p.kind = 'fixed' THEN
    d := LEAST(_subtotal_cents, COALESCE(p.value_cents, 0));
  END IF;

  RETURN QUERY SELECT p.id, d, p.kind, p.code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_promo_code(text, uuid, integer, uuid, text) TO anon, authenticated;

-- Get or create the caller's personal referral code
CREATE OR REPLACE FUNCTION public.get_or_create_my_referral_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_new text;
  v_tries int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT code INTO v_code FROM public.promo_codes
   WHERE owner_user_id = v_uid AND kind = 'referral' LIMIT 1;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  LOOP
    v_new := 'REF' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    BEGIN
      INSERT INTO public.promo_codes(code, kind, value_pct, owner_user_id, min_subtotal_cents)
        VALUES (v_new, 'referral', 10.00, v_uid, 500);
      RETURN v_new;
    EXCEPTION WHEN unique_violation THEN
      v_tries := v_tries + 1;
      IF v_tries > 5 THEN RAISE; END IF;
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_my_referral_code() TO authenticated;
