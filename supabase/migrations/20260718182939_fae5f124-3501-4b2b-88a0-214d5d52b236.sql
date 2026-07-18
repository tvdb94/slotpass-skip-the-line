
ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS daily_stock integer,
  ADD COLUMN IF NOT EXISTS stock_date date,
  ADD COLUMN IF NOT EXISTS stock_remaining integer;

-- Atomic stock decrement; returns rows updated (0 => sold out or not stocked)
CREATE OR REPLACE FUNCTION public.decrement_stock(_item_id uuid, _qty integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.menu_items
     SET stock_remaining = stock_remaining - _qty
   WHERE id = _item_id
     AND daily_stock IS NOT NULL
     AND stock_remaining IS NOT NULL
     AND stock_remaining >= _qty;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Restrict RPC to service_role (called only from server fns via admin client).
REVOKE ALL ON FUNCTION public.decrement_stock(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decrement_stock(uuid, integer) TO service_role;

-- Nightly stock reset
CREATE OR REPLACE FUNCTION public.reset_daily_stock()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.menu_items
     SET stock_remaining = daily_stock,
         stock_date = (now() AT TIME ZONE 'Europe/Amsterdam')::date
   WHERE daily_stock IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.reset_daily_stock() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_daily_stock() TO service_role;

ALTER TABLE public.menu_items REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
