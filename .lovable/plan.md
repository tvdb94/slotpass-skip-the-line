# Phase 10.1 — Vendor self-signup & onboarding wizard

Replace the single-page "Become a vendor" form with a guided wizard, and add a post-approval onboarding flow so new vendors can set up branding, menu, and slots before going live.

## Flow

```text
/become-vendor  (public wizard, sign-up gated on step 1)
  1. Account       → email + password (or sign in) → create Supabase user
  2. Business      → name, cuisine, address, phone, contact
  3. Branding      → proposed slug, primary brand color, hero description, headline (NL/EN)
  4. Menu draft    → add 1..N items (name, category, price)
  5. Slots draft   → day-of-week template: open days, start/end time, capacity
  6. Review        → summary + submit → status "pending"
Admin approves in /admin (unchanged UI)
  → RPC creates vendor row + copies drafts into menu_items, categories, slots for next 7 days
  → applicant sees /vendor "onboarding" checklist (branding, first slot, Stripe Connect, first order)
```

## Data changes

Extend `public.vendor_applications` with wizard draft fields, all nullable so the existing form still works:

- `proposed_slug text`
- `brand_primary text`
- `headline_nl text`, `headline_en text`
- `hero_description text`
- `menu_draft jsonb` — array of `{ name, category, price_cents }`
- `slots_draft jsonb` — `{ days: number[], start: "HH:MM", end: "HH:MM", interval_min: 15, capacity: number }`

Replace `approve_vendor_application(_application_id, _slug, ...)` with a version that:
1. Reads the application, uses `proposed_slug` when `_slug` is null.
2. Creates the vendor with brand color + headlines + description.
3. If `menu_draft` present: upserts categories, inserts menu_items.
4. If `slots_draft` present: generates 15-min slots for the next 7 days matching the template.
5. Preserves current staff/user_roles grant + application status update.

## Files

- `src/routes/become-vendor.tsx` — rewrite into a stepper (Steps 1-6). Local state per step, "Next"/"Back", progress bar. Uses existing i18n.
- `src/lib/i18n.tsx` — add wizard strings (step titles, field labels, helper text, submit button) in NL + EN.
- `src/routes/admin.tsx` — show draft counts (`X items · Y slots/day`) on each pending row so admins see it was submitted via wizard.
- `src/routes/vendor.tsx` — add an "Onboarding" card at the top for freshly-approved vendors: checklist (Confirm branding, Add first real slot today, Connect Stripe payouts, Receive first order). Dismissable via localStorage per vendor id.
- New migration: schema extension + updated `approve_vendor_application` function.

## Technical details

- Wizard uses a single component with `step` state (1..6); each step is a small subcomponent to keep the file focused.
- Step 1 either signs in an existing user or `supabase.auth.signUp` a new one. If signup returns a session (auto-confirm on), continue; otherwise show "check your email" and stop — application is saved after auth.
- Draft JSON validated client-side (zod-style min checks inline, no new dep) before allowing "Next".
- Slot template generator is server-side inside the RPC so slot dates are always relative to approval time.
- Existing single-shot form path is removed; anyone hitting `/become-vendor` gets the wizard.
- Admin approval no longer needs a slug prompt when `proposed_slug` is set — the admin can still override via the same prompt if desired.

## Out of scope for 10.1

- Logo / hero image uploads (would need a storage bucket — separate 10.x).
- Rich menu editor with photos.
- Stripe Connect onboarding button on the wizard (kept in vendor dashboard as today).
