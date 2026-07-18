# Phase 9 — Demand-Shaping

Four independent features, shipped in this order. Each is a schema migration first, then Server Fns, then UI. All money math and stock decrements happen server-side in Server Fns; RLS forbids client writes to stock/discounts.

## 9.1 Dynamic slot pricing

**Goal:** vendor sets rules that automatically discount low-fill slots as pickup time approaches.

**Schema (migration):**
- `vendors.dynamic_pricing_enabled bool default false`
- `pricing_rules` table: `id, vendor_id, trigger_minutes int (e.g. 120), max_fill_pct int (e.g. 30), discount_pct numeric(4,2), active bool, priority int`. Vendor-owned via staff; RLS: vendor staff manage; anon SELECT for active rules (needed to display).
- `slots.auto_discount_pct numeric(4,2) default 0` — computed & written by the pricer.
- Reuse `item_slot_discounts` for manual off-peak; do NOT collapse them.

**Server logic:**
- `src/lib/pricing.server.ts`: `computeSlotDiscount(vendorId, slotId)` — picks the highest-priority matching rule and returns pct.
- Cron `/api/public/hooks/apply-dynamic-pricing` runs every 5 min: for each slot in next 4h with capacity>0, compute fill %, write `slots.auto_discount_pct`. Idempotent.
- Checkout server fn: on order-create it re-reads `slots.auto_discount_pct` and applies it AFTER manual `item_slot_discounts` (take the larger of the two per item, not stacked).

**UI:**
- `/vendor` → new "Pricing rules" card: add/remove rules, toggle enabled.
- Slot picker (`checkout.tsx`) and vendor page (`$slug.tsx`): show a "−X% off-peak" chip on any slot where `auto_discount_pct > 0`.
- Promo carousel: include top 3 slots with `auto_discount_pct >= 15`.

## 9.2 Priority slot tier

**Goal:** paid express-lane premium.

**Schema (migration):**
- `vendors.priority_upcharge_cents int default 0` and `vendors.priority_enabled bool default false`.
- `slots.priority_capacity int default 0`, `slots.priority_booked int default 0`.
- `orders.is_priority bool default false`, `orders.priority_upcharge_cents int default 0`.

**Server logic:**
- Checkout fn: if `is_priority=true`, verify `priority_booked < priority_capacity`, add upcharge to `subtotal_cents`, and its share to `platform_fee_cents` proportionally (upcharge flows through same Stripe split — vendor keeps upcharge minus commission).
- Increment `priority_booked` in same transaction.

**UI:**
- Slot picker: for each slot that has priority capacity, render a "Priority — +€X.XX" toggle. Selecting it sets `is_priority`.
- Vendor dashboard: per-slot input for `priority_capacity`.

## 9.3 Drop mode (limited daily stock)

**Goal:** hard stock caps, live counter, auto sold-out.

**Schema (migration):**
- `menu_items.daily_stock int null` (null = unlimited) and `menu_items.stock_date date null`, `menu_items.stock_remaining int null`.
- Nightly cron resets `stock_remaining = daily_stock` and updates `stock_date` for items where `daily_stock is not null`.

**Server logic:**
- Checkout fn: `SELECT ... FOR UPDATE` on stocked items, decrement `stock_remaining` atomically, refuse order if insufficient. Errors surface as friendly "Sold out" per item.
- Realtime: enable on `menu_items` so the vendor page shows live "X left today".

**UI:**
- `$slug.tsx` menu card: badge "X left today" when `daily_stock` set; disabled + "Sold out" at 0.
- `/vendor` menu editor: add `daily_stock` input.

## 9.4 Waitlist for full slots

**Goal:** join queue on full slots; auto-notify on freed capacity with a time-boxed claim.

**Schema (migration):**
- `waitlist_entries`: `id, slot_id, user_id (nullable for guests), customer_email, customer_name, items jsonb (menu_item_id + qty), status enum('waiting','offered','claimed','expired','canceled'), offered_at, claim_expires_at, created_at`. RLS: user reads own; vendor staff read theirs.
- Grants + service_role.

**Server logic:**
- `joinWaitlist` server fn: creates entry if slot full.
- `releaseSlotCapacity` server fn (called from order cancel/refund/no-show handlers): find oldest `waiting` entry, mark `offered`, set `claim_expires_at = now()+15min`, queue notification via existing `src/lib/notifications.ts`.
- `claimWaitlistOffer` server fn: converts offer into a real order (routes through the standard checkout path).
- Cron `/api/public/hooks/expire-waitlist-offers` every minute: expires stale offers and cascades to next in queue.

**UI:**
- Checkout `SlotPicker`: when a slot is full, replace "Select" with "Join waitlist"; open a mini dialog to capture name/email/phone (or use signed-in profile).
- New route `/waitlist/$id`: shows queue position, and — when `status='offered'` — a "Claim now" button + countdown.
- `/orders` (customer portal): add "Waitlist" section.

## Cross-cutting

- **i18n:** add ~25 keys in both nl and en.
- **Analytics:** vendor dashboard adds "Auto-discount revenue", "Priority orders", "Sold-out timestamps", "Waitlist conversion".
- **Realtime:** add `menu_items` and `waitlist_entries` to `supabase_realtime` publication.
- **Tests via preview:** after each sub-phase, take a screenshot of the affected screen (checkout, vendor dashboard, waitlist page) in the running app.

## Execution order

1. 9.1 dynamic pricing (schema → pricer cron → checkout math → UI chips → vendor rules card)
2. 9.3 drop mode (schema → nightly reset cron → checkout decrement → UI counters)
3. 9.2 priority tier (schema → checkout upcharge → UI toggle + vendor input)
4. 9.4 waitlist (schema + RLS → join/claim/expire fns → cron → UI)

Each sub-phase is self-contained; safe to pause between them.
