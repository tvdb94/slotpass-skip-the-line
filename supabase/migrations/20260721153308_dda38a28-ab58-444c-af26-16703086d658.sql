
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.reviews ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- Reviews: hide moderated ones from public
DROP POLICY IF EXISTS "reviews read" ON public.reviews;
CREATE POLICY "reviews read" ON public.reviews FOR SELECT
  USING (
    NOT is_hidden
    OR public.has_role(auth.uid(),'admin')
    OR public.is_vendor_staff(vendor_id)
  );

-- Admins can moderate reviews
DROP POLICY IF EXISTS "reviews admin update" ON public.reviews;
CREATE POLICY "reviews admin update" ON public.reviews FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS "reviews admin delete" ON public.reviews;
CREATE POLICY "reviews admin delete" ON public.reviews FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Vendors: admins see inactive too
DROP POLICY IF EXISTS "vendors read" ON public.vendors;
CREATE POLICY "vendors read" ON public.vendors FOR SELECT
  USING (is_active OR public.has_role(auth.uid(),'admin') OR public.is_vendor_staff(id));

-- Admins can update vendors (feature toggle, city, active status)
DROP POLICY IF EXISTS "vendors admin update" ON public.vendors;
CREATE POLICY "vendors admin update" ON public.vendors FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Seed city on existing vendors
UPDATE public.vendors SET city = 'Amsterdam' WHERE city IS NULL;
