
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS dynamic_pricing_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.slots
  ADD COLUMN IF NOT EXISTS auto_discount_pct numeric(5,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  trigger_minutes integer NOT NULL CHECK (trigger_minutes BETWEEN 5 AND 1440),
  max_fill_pct integer NOT NULL CHECK (max_fill_pct BETWEEN 1 AND 100),
  discount_pct numeric(5,2) NOT NULL CHECK (discount_pct BETWEEN 1 AND 90),
  priority integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pricing_rules TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rules TO authenticated;
GRANT ALL ON public.pricing_rules TO service_role;

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active pricing rules"
  ON public.pricing_rules FOR SELECT
  USING (active = true);

CREATE POLICY "Vendor staff manage pricing rules"
  ON public.pricing_rules FOR ALL
  TO authenticated
  USING (public.is_vendor_staff(vendor_id))
  WITH CHECK (public.is_vendor_staff(vendor_id));

CREATE TRIGGER trg_pricing_rules_updated
  BEFORE UPDATE ON public.pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_pricing_rules_vendor_active
  ON public.pricing_rules(vendor_id, active, priority DESC);
