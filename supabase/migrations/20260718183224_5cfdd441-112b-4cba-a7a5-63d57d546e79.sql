
-- Priority tier on slots
ALTER TABLE public.slots
  ADD COLUMN IF NOT EXISTS priority_capacity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority_upcharge_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority_taken integer NOT NULL DEFAULT 0;

-- Priority on orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_priority boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_upcharge_cents integer NOT NULL DEFAULT 0;

-- Waitlist table
CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
  slot_id uuid NOT NULL REFERENCES public.slots(id) ON DELETE CASCADE,
  customer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_email text NOT NULL,
  customer_name text,
  party_size integer NOT NULL DEFAULT 1 CHECK (party_size > 0 AND party_size <= 20),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','offered','claimed','expired','cancelled')),
  offered_at timestamptz,
  offer_expires_at timestamptz,
  claimed_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.waitlist_entries TO authenticated;
GRANT SELECT, INSERT ON public.waitlist_entries TO anon;
GRANT ALL ON public.waitlist_entries TO service_role;

ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;

-- Anyone (guest checkout) can insert waitlist entries with their email
CREATE POLICY "waitlist_insert_public"
  ON public.waitlist_entries FOR INSERT
  WITH CHECK (true);

-- Owners can read/cancel their own entries: match by user id OR by email while signed in
CREATE POLICY "waitlist_select_own"
  ON public.waitlist_entries FOR SELECT
  USING (
    customer_user_id = auth.uid()
    OR lower(customer_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

CREATE POLICY "waitlist_update_own"
  ON public.waitlist_entries FOR UPDATE
  USING (
    customer_user_id = auth.uid()
    OR lower(customer_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

-- Vendor staff can see/manage their vendor's waitlist
CREATE POLICY "waitlist_select_vendor"
  ON public.waitlist_entries FOR SELECT
  USING (public.is_vendor_staff(vendor_id));

CREATE POLICY "waitlist_update_vendor"
  ON public.waitlist_entries FOR UPDATE
  USING (public.is_vendor_staff(vendor_id));

CREATE TRIGGER touch_waitlist_updated_at
  BEFORE UPDATE ON public.waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS waitlist_slot_status_idx
  ON public.waitlist_entries (slot_id, status, created_at);

-- Claim RPC: waitlist entry consumes one seat if still open
CREATE OR REPLACE FUNCTION public.claim_waitlist_offer(_entry_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e public.waitlist_entries;
  s public.slots;
BEGIN
  SELECT * INTO e FROM public.waitlist_entries WHERE id = _entry_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
  IF e.status <> 'offered' THEN RAISE EXCEPTION 'Offer not active'; END IF;
  IF e.offer_expires_at IS NULL OR e.offer_expires_at < now() THEN
    UPDATE public.waitlist_entries SET status='expired' WHERE id=e.id;
    RAISE EXCEPTION 'Offer expired';
  END IF;
  -- Ownership check (user OR email match)
  IF NOT (
    e.customer_user_id = auth.uid()
    OR lower(e.customer_email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.waitlist_entries SET status='claimed' WHERE id=e.id;
  RETURN e.slot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_waitlist_offer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_waitlist_offer(uuid) TO authenticated, anon;

-- Promote next waiting entry to 'offered' if slot has capacity
CREATE OR REPLACE FUNCTION public.promote_waitlist()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s record;
  e record;
  n integer := 0;
BEGIN
  -- Expire old offers
  UPDATE public.waitlist_entries
     SET status = 'expired'
   WHERE status = 'offered' AND offer_expires_at < now();

  FOR s IN
    SELECT sl.id, sl.capacity, sl.orders_count
      FROM public.slots sl
     WHERE sl.is_open = true
       AND (sl.date + sl.start_time) > (now() AT TIME ZONE 'Europe/Amsterdam')
       AND sl.orders_count < sl.capacity
       AND EXISTS (SELECT 1 FROM public.waitlist_entries w
                    WHERE w.slot_id = sl.id AND w.status = 'waiting')
  LOOP
    -- Skip if there's already an active offer for this slot
    IF EXISTS (SELECT 1 FROM public.waitlist_entries
                WHERE slot_id = s.id AND status = 'offered'
                  AND offer_expires_at > now()) THEN
      CONTINUE;
    END IF;

    SELECT * INTO e FROM public.waitlist_entries
      WHERE slot_id = s.id AND status = 'waiting'
      ORDER BY created_at ASC LIMIT 1;
    IF e.id IS NULL THEN CONTINUE; END IF;

    UPDATE public.waitlist_entries
       SET status = 'offered',
           offered_at = now(),
           offer_expires_at = now() + interval '10 minutes'
     WHERE id = e.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_waitlist() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_waitlist() TO service_role;

ALTER TABLE public.waitlist_entries REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist_entries;
