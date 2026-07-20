
ALTER TABLE public.vendor_applications
  ADD COLUMN IF NOT EXISTS proposed_slug text,
  ADD COLUMN IF NOT EXISTS brand_primary text,
  ADD COLUMN IF NOT EXISTS headline_nl text,
  ADD COLUMN IF NOT EXISTS headline_en text,
  ADD COLUMN IF NOT EXISTS hero_description text,
  ADD COLUMN IF NOT EXISTS menu_draft jsonb,
  ADD COLUMN IF NOT EXISTS slots_draft jsonb;

DROP FUNCTION IF EXISTS public.approve_vendor_application(uuid, text, text, integer, numeric);

CREATE OR REPLACE FUNCTION public.approve_vendor_application(
  _application_id uuid,
  _slug text DEFAULT NULL,
  _brand_primary text DEFAULT NULL,
  _service_fee_cents integer DEFAULT 50,
  _commission_pct numeric DEFAULT 2.0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_app public.vendor_applications;
  v_vendor_id uuid;
  v_slug text;
  v_brand text;
  v_item jsonb;
  v_cat_id uuid;
  v_cat_name text;
  v_days jsonb;
  v_start_time time;
  v_end_time time;
  v_interval int;
  v_capacity int;
  v_day_offset int;
  v_target_date date;
  v_dow int;
  v_slot_time time;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO v_app FROM public.vendor_applications WHERE id = _application_id;
  IF v_app.id IS NULL THEN RAISE EXCEPTION 'Application not found'; END IF;
  IF v_app.status <> 'pending' THEN RAISE EXCEPTION 'Already decided'; END IF;

  v_slug := COALESCE(NULLIF(_slug, ''), v_app.proposed_slug);
  IF v_slug IS NULL OR v_slug = '' THEN RAISE EXCEPTION 'Slug required'; END IF;
  v_brand := COALESCE(NULLIF(_brand_primary, ''), v_app.brand_primary, '#111827');

  INSERT INTO public.vendors (
    slug, name, cuisine, description, address,
    brand_primary, service_fee_cents, commission_pct, is_active,
    featured_headline_nl, featured_headline_en
  ) VALUES (
    v_slug, v_app.business_name, v_app.cuisine,
    COALESCE(v_app.hero_description, v_app.description),
    v_app.address,
    v_brand, _service_fee_cents, _commission_pct, true,
    v_app.headline_nl, v_app.headline_en
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

  -- Menu draft
  IF v_app.menu_draft IS NOT NULL AND jsonb_typeof(v_app.menu_draft) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_app.menu_draft) LOOP
      v_cat_name := COALESCE(NULLIF(v_item->>'category', ''), 'Menu');
      SELECT id INTO v_cat_id FROM public.categories
        WHERE vendor_id = v_vendor_id AND name = v_cat_name LIMIT 1;
      IF v_cat_id IS NULL THEN
        INSERT INTO public.categories (vendor_id, name, sort_order)
        VALUES (v_vendor_id, v_cat_name, 0)
        RETURNING id INTO v_cat_id;
      END IF;
      INSERT INTO public.menu_items (vendor_id, category_id, name, price_cents, is_available)
      VALUES (
        v_vendor_id, v_cat_id,
        COALESCE(NULLIF(v_item->>'name', ''), 'Item'),
        COALESCE((v_item->>'price_cents')::int, 0),
        true
      );
    END LOOP;
  END IF;

  -- Slots draft (7 days)
  IF v_app.slots_draft IS NOT NULL AND jsonb_typeof(v_app.slots_draft) = 'object' THEN
    v_days := COALESCE(v_app.slots_draft->'days', '[1,2,3,4,5]'::jsonb);
    v_start_time := COALESCE(NULLIF(v_app.slots_draft->>'start', ''), '12:00')::time;
    v_end_time := COALESCE(NULLIF(v_app.slots_draft->>'end', ''), '14:00')::time;
    v_interval := COALESCE((v_app.slots_draft->>'interval_min')::int, 15);
    v_capacity := COALESCE((v_app.slots_draft->>'capacity')::int, 6);

    FOR v_day_offset IN 0..6 LOOP
      v_target_date := ((now() AT TIME ZONE 'Europe/Amsterdam')::date + v_day_offset);
      v_dow := EXTRACT(DOW FROM v_target_date)::int;
      IF v_days @> to_jsonb(v_dow) THEN
        v_slot_time := v_start_time;
        WHILE v_slot_time < v_end_time LOOP
          INSERT INTO public.slots (vendor_id, date, start_time, capacity, is_open)
          VALUES (v_vendor_id, v_target_date, v_slot_time, v_capacity, true)
          ON CONFLICT DO NOTHING;
          v_slot_time := v_slot_time + (v_interval || ' minutes')::interval;
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.vendor_applications
     SET status = 'approved',
         approved_vendor_id = v_vendor_id,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   WHERE id = _application_id;

  RETURN v_vendor_id;
END;
$function$;
