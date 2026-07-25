# SlotPass — React Native (Full Native) Migration Plan

> **Goal:** Rebuild the SlotPass frontend as a **native iOS + Android app** with **Expo**. **No web app / no PWA** — native only. The frontend (screens, design system, navigation, flows, client state) is ported; the **backend is rebuilt by us** as Supabase Edge Functions against an explicit API contract (§7).
>
> **Where this happens:** A **new standalone repo `slotpass-mobile`**. This repo (`slotpass-skip-the-line`, the TanStack web app) becomes **read-only reference** for business rules and design tokens. A **brand-new empty Supabase project** is created for the rebuild — the old project holds only throwaway demo data (verified: 3 demo vendors, **0 orders, 0 real users** — see §5.1). Migrations are copied into the new repo and applied to the new project, which becomes the schema source of truth.
>
> **What we keep vs. throw away (locked 2026-07-25):** From the old Lovable app we keep exactly three things — (1) the **frontend design** (tokens, screens, UX flows) as visual reference, (2) the **database schema** (plain SQL migrations, copied as-is), and (3) the **money rules** (prices, fees, commission, promo logic) as a *written spec* to rebuild against. **Zero old application code is copied into the new app** — every screen is rewritten in React Native, every server function is rewritten as a Deno Edge Function. Everything else (TanStack web code, PWA bits, Lovable tooling) is thrown away.

---

## 0. How to use this document (read first, every chat)

This migration runs across **multiple chats, one per phase**. From Phase 1 onward this file lives in `slotpass-mobile/`. Each phase chat MUST:

1. **Read this whole file** — esp. Locked Decisions (§2), Target Stack (§4), Risks (§5), Conventions (§6), API Contract (§7), and your assigned phase.
2. **Check the Progress Tracker (§9)** and your phase's `Depends on`. Don't start if prerequisites aren't `✅ Done`.
3. **Do only your phase.** No scope-creep into later phases.
4. **Fill in your phase's `📝 Findings / What was built`**: what was built, key files, decisions, deviations, what the next phase must know, and any updates to the API Contract (§7).
5. **Log discoveries in the Working Backlog (§12).** Anything real but out of your phase's scope — bug, tech debt, risky assumption, follow-up, missing test, decision needed — append it there. Don't fix it (scope creep) and don't drop it (drift).
6. **Run a code review** to close the phase — `/code-review high` (or `/code-review ultra` for the big ones: 2, 5, 6, 8) **and a `/security-review`** (this app handles payments — every phase, no exceptions). Record both in the phase's `✅ Code Review` block.
7. **Update the Progress Tracker (§9)** and the phase `Status:` line.
8. **Commit & ship the branch** per the git workflow in §6a: work on a `phase-<N>` branch, push it, open a PR (GitHub MCP or `gh`), merge once the §0a gates pass. The next phase always starts from an up-to-date `main`.

Status legend: `⬜ Not started` · `🟡 In progress` · `✅ Done` · `⛔ Blocked`

### 0a. Definition of Done — HARD GATE (no exceptions)

A phase may **only** be marked `✅ Done` when **all** of these are true. This is the anti-runaway gate:

1. ✅ Typecheck passes, lint passes, the app boots in the **iOS** simulator (Android becomes a required gate at **P9** — see §6; backend phases: functions deploy + tests pass).
2. ✅ The phase's **Done when** criteria are demonstrably met (not "should work" — actually exercised).
3. ✅ `📝 Findings / What was built` is filled in: choices made, components built, deviations, what the next phase needs.
4. ✅ **A `/code-review` was run** (`high` for normal phases, `ultra` for 2/5/6/8) **and a `/security-review`** — and **every finding is either fixed or explicitly logged** in `✅ Code Review` with a reason it's deferred. (Security review is mandatory every phase: this app will handle real payments.)
5. ✅ §7 API Contract and §9 Progress Tracker updated.
6. ✅ **Every out-of-scope discovery from this session is logged in §12** (Working Backlog) — not silently fixed, not forgotten.
7. ✅ Committed on a `phase-<N>` branch, pushed, PR opened — merged to `main` once all gates pass (§6a).

> **If you cannot satisfy a gate, mark the phase `⛔ Blocked`, write why in Findings, and stop. Never fake "Done".**
> Do **not** invent files, endpoints, or component names — if the reference repo or contract doesn't have it, say so in Findings instead of inventing it. Verify every import/path against the actual codebase before claiming it works.

### 0b. Copy-paste kickoff prompt (use this to start each phase chat)

Open a **new chat in the `slotpass-mobile` repo** and paste this, filling in the phase number:

```
Read REACT_NATIVE_MIGRATION.md in full, then build **Phase <N>** only.

Rules:
- Do ONLY Phase <N>. Do not touch later phases.
- Respect the phase's "Depends on" — if a prerequisite isn't ✅ Done in §9, stop and tell me.
- Build against the reference repo (../slotpass-skip-the-line) for business rules and design
  tokens. Do NOT invent files, endpoints, prices, or component names — verify against the
  actual code/contract; if something is missing, note it in Findings rather than fabricating.
- Use the MCP tools mapped in §6a (Supabase / GitHub / Resend / Vercel) for all infra work —
  create, deploy, and query through MCP. Only the steps §6a lists as MANUAL go to me.
- Follow the §0a Definition of Done exactly.

During the build: whenever you hit something real but out of THIS phase's scope (bug, tech debt,
risky assumption, follow-up, missing test, decision needed), append it to §12 (Working Backlog).
Do not fix it (scope creep) and do not drop it (drift).

To finish, you MUST:
1. Fill in the phase's "📝 Findings / What was built" section in the MD.
2. Ensure every out-of-scope discovery this session is logged in §12 (Working Backlog).
3. Run /code-review <high|ultra per the phase header> AND /security-review; resolve or log
   every finding in the "✅ Code Review" block. You can run `high` and /security-review
   yourself; /code-review ultra is user-triggered and billed — STOP at the review gate and
   ask ME to type it. Never claim an ultra review ran when it didn't.
4. Update §7 (API Contract) and §9 (Progress Tracker), set the phase Status.
5. Commit on the `phase-<N>` branch, push, open the PR (§6a git workflow).

Do not mark the phase ✅ Done unless all §0a gates pass. If any gate fails, mark it ⛔ Blocked
and explain why. Show me the review output before committing.
```

---

## 1. What we're rebuilding (source app — reference only)

- **Framework:** TanStack Start (SSR + file routing + server functions), React 19, Supabase, Stripe.
- **Routes (~4,600 LOC):** `index` (landing + vendor list + map), `$slug` (vendor detail/menu/slots/waitlist), `checkout`, `orders`, `order.$code`, `login` (OTP), `vendor` (1,319 LOC dashboard), `admin`, `become-vendor` (Stripe Connect onboarding).
- **Server logic → rebuild spec:** `lib/checkout.functions.ts`, `lib/connect.functions.ts`, `lib/promo.functions.ts`; API routes `webhooks/stripe`, `webhooks/stripe-connect`, cron `apply-dynamic-pricing`, `mark-no-shows`, `send-reminders`.
- **UI:** shadcn/ui (Radix) + Tailwind v4; design tokens in `src/styles.css` (oklch, light/dark).
- **Integrations:** Supabase (auth + Postgres), Stripe **Checkout Sessions** (destination charge + application fee), Leaflet maps, custom i18n (nl/en), qrcode.react, recharts, notifications.

### 1.1 Backend baseline — what exists, what's covered, what's missing

_Full detail in `BACKEND_ANALYSIS.md`. Condensed here so the backend rebuild (Phase 2) is self-contained._

**The uncomfortable truth about the current backend:** the business logic is genuinely good, but it lives inside **TanStack Start server functions** (`createServerFn`) — a web-RPC bound to the web bundle. **React Native cannot call it.** There are **no Supabase Edge Functions today**; Supabase is used only as DB + auth. So Phase 2 is a *re-homing* of proven logic into Deno Edge Functions, **not** a greenfield backend and **not** a copy-paste (Deno ≠ Node).

**✅ Covered today (preserve the rules, move the runtime):**
- Server-authoritative checkout: vendor/slot/stock validation, price/discount/commission recomputed server-side (client cart = ids + quantities only), Stripe Connect **destination charge + application fee**, order persisted as `pending`.
- Stripe Connect onboarding (Express), status refresh, vendor earnings + payout history.
- Promo codes + referrals (`validate_promo_code`, redemption tracking), waitlist claim/promote, priority tiers, per-item daily stock with **atomic decrement + rollback**, dynamic pricing, no-show marking.
- Rich data model (15+ tables, RLS everywhere, RBAC via `has_role`/`app_role`), all reusable as-is — **migrations are copied, not rewritten.**

**❌ / 🟡 Gaps the rebuild must close (each mapped to a Phase 2 sub-phase):**
| # | Gap | Consequence | Addressed in |
|---|---|---|---|
| G1 | **No mobile-callable API** — all logic in `createServerFn` | RN can't order/pay at all | **P2.1–P2.2** (Edge Functions) |
| G2 | **Cron hooks are open POST, no secret**, run with service-role | Anyone can trigger no-show/pricing jobs | **P2.3** (shared-secret gate) |
| G3 | **Notifications are a stub** (`console.log`, no sender domain) | Zero confirmation/reminder emails go out | **P2.3** (real email provider) |
| G4 | **No refund / cancellation path** | Paid-but-undeliverable = manual handling | **Post-MVP (§11)** — admin refunds manually via Stripe dashboard for now |
| G5 | **No push** | Core mobile hook (order-ready/reminder) absent | P7 (expo-notifications) |
| G6 | **No tests on money paths** | Silent fee/commission errors | P2 money-math tests |
| G7 | **Checkout Session ≠ PaymentSheet** | Payment is a redesign, webhook event changes | P2.2 + P6 |

**⚠️ Fulfillment loop gap (decided — deferred, see §11):** MVP is *customer-app-first* with *no web app*, so **there is deliberately no QR-scan/collect UI in this scope**. During the customer MVP the pickup loop is closed **out-of-band** (vendor eyeballs the `order_code`/QR; no status flip to `collected`). The `markOrderCollected` endpoint + vendor scan UI are **explicitly out of current scope → §11 To be built**. `mark-no-shows` cron still runs, so uncollected orders age out normally.

---

## 2. Locked decisions

| Decision | Choice | Consequence |
|---|---|---|
| **Platforms** | **Native iOS + Android only. No web / no PWA.** | No React Native Web, no SSR/SEO concerns, no web bundler. |
| **Toolkit** | **Expo (managed) + Expo Router** | File routing mirrors current routes; EAS for builds/OTA. |
| **Repo** | **New standalone repo `slotpass-mobile` (no monorepo)** | Flat repo avoids Metro/workspace pain. Old repo = read-only reference. |
| **Backend** | **Rebuilt by us as Supabase Edge Functions (Deno)** to contract §7 | Not a port. Old server fns are the business-rule spec. **New empty Supabase project** (§5.1). |
| **UI system** | **NativeWind + react-native-reusables** ("shadcn for RN") | Keeps `className` + shadcn variants; closest port of existing UI. |
| **Payments** | **Stripe PaymentSheet** (`@stripe/stripe-react-native`) via PaymentIntent | Hosted Checkout redirect doesn't fit native → checkout is **redesigned**. |
| **Scope order** | **Customer flows first, then vendor/admin** | Ship the buyer app first; vendor/admin land in Phase 8. |
| **FE/BE coupling** | **Typed api-client with mocks first** | Frontend builds against mocks; swap to live Edge Functions when ready. |
| **Accounts** | **Mandatory account before ordering** (no guest checkout) | Enables push + order history + support; login gate precedes checkout (P6). ⚠️ Changes order **ownership**: reference links orders by **email**/guest (`orders_link_customer`), so P2.1 must add `user_id` + RLS so `getOrders()` shows only your own. Not just a UI gate. |
| **Vendor onboarding (pilot)** | **Manual** — admin onboards the first real vendors by hand (Stripe Connect + DB) | Customer MVP (P1–7) has **no in-app onboarding**; self-serve onboarding lands in **P8**. Fine — greenfield, so onboard your first vendors whenever ready. Nothing carries over from demo data. |
| **Fresh start (no legacy)** | **Brand-new empty Supabase project + new Stripe setup**; old web app is reference-only and **not kept running** | Old DB holds only demo data (§5.1) → **no coexistence rules**: change schema freely, no dual payment paths, no webhook-overlap trap. |
| **Transactional email** | **Resend** (API key as function secret) | Order confirmation + reminders (P2.3). Needs sender domain + DNS. |
| **Refunds / cancellation** | **Out of MVP scope** — admin refunds manually via Stripe dashboard | No `refundOrder`/`cancelOrder` endpoint now → §11. |
| **Fulfillment (QR-scan/collect)** | **Out of MVP scope** — vendor tooling deferred | No `markOrderCollected` UI in customer MVP → §11. |
| **Cron** | **Supabase `pg_cron` + `pg_net`** calling secret-gated Edge Functions | Fixes the open-endpoint gap (G2). |
| **Phase execution** | **Strictly sequential — one phase chat at a time, no parallel chats** (decided 2026-07-25) | Every chat sees the latest Findings/§7/§9; no cross-branch merge conflicts. Follow §9 order: 1 → 2.1 → 2.2 → 2.3 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. |
| **Web presence** | **Tiny static site on Vercel** (P9): landing + privacy policy + universal-link file (decided 2026-07-25) | Not a web app. App Store requires a hosted privacy policy; universal links need `apple-app-site-association` on a domain; the same domain carries the Resend email DNS. |
| **Tooling** | **MCP-first** — Supabase / GitHub / Resend / Vercel MCP tools do the infra work (§6a) | Manual only where no MCP exists: Stripe dashboard, Supabase function secrets, domain DNS, Apple Developer / Play Console. |

---

## 3. Repo layout (`slotpass-mobile`)

```
slotpass-mobile/
  app/                  # Expo Router screens
    index.tsx           # was routes/index.tsx (landing)
    [slug].tsx          # was routes/$slug.tsx (vendor detail)
    checkout.tsx
    orders.tsx
    order/[code].tsx
    login.tsx
    vendor/ , admin/    # phase 8
    _layout.tsx         # providers + navigation shell
  src/
    components/         # react-native-reusables UI + StarRating, Header, LanguageToggle
    lib/               # supabase client, api-client, cart, i18n, notifications
    shared/            # zod schemas + generated Supabase types (source of truth)
    theme/             # NativeWind tokens ported from styles.css (oklch light/dark)
  supabase/
    migrations/         # COPIED from reference repo; schema source of truth going forward
    functions/          # NEW Edge Functions (backend rebuild)
  assets/               # icons, splash, fonts
  app.json  eas.json  metro.config.js  babel.config.js  tailwind.config.js
  REACT_NATIVE_MIGRATION.md   # this file (moved here in Phase 1)
```

---

## 4. Stack mapping (old → new)

| Concern | Web (reference) | Native target |
|---|---|---|
| Framework/routing | TanStack Start / Router (file) | Expo + Expo Router (file) |
| Data fetching | @tanstack/react-query | **unchanged** ✓ |
| Server logic | `createServerFn` + API routes | Supabase Edge Functions behind `lib/api-client` |
| Forms/validation | react-hook-form + zod | **unchanged** ✓ |
| Dates | date-fns | **unchanged** ✓ |
| Styling | Tailwind v4 (`styles.css` oklch) | **NativeWind** + ported token theme |
| Components | shadcn/ui + Radix | **react-native-reusables** |
| Icons | lucide-react | **lucide-react-native** |
| Maps | leaflet / react-leaflet | **react-native-maps** (native only — no web fallback needed) |
| Payments | Stripe Checkout Session (redirect) | **@stripe/stripe-react-native** PaymentSheet via PaymentIntent |
| QR | qrcode.react | **react-native-qrcode-svg** |
| Charts | recharts | **victory-native** / **react-native-gifted-charts** (vendor/admin) |
| Toasts | sonner | **burnt** or RN toast |
| Drawer/Sheet | vaul | **@gorhom/bottom-sheet** (or r-n-reusables sheet) |
| Modals | Radix Dialog | RN Modal / r-n-reusables |
| Session storage | cookie/localStorage | **expo-secure-store** (+ AsyncStorage) adapter on Supabase client |
| Local persistence (cart, lang) | localStorage | **AsyncStorage** adapter |
| Env vars | `VITE_*` / `import.meta.env` | **`EXPO_PUBLIC_*`** / `process.env` |
| Notifications | Web Push | **expo-notifications** (APNs/FCM) |
| i18n | custom `lib/i18n.tsx` (localStorage) | ported provider (AsyncStorage adapter) |

---

## 5. Cross-cutting risks (keep visible every phase)

1. **Stripe checkout is a redesign, not a port.** Checkout Session redirect → PaymentIntent + PaymentSheet. Server recomputes all totals/fees/commission/discounts (spec: `checkout.functions.ts`). Confirmation returns via app state / deep link, not a redirect URL. **Highest money-risk area.**
2. **Business-rule fidelity.** Rebuilt backend MUST match: server-authoritative pricing, application fee/commission, promo validation, dynamic pricing, no-show marking, reminders. Old server fns = spec. Add money-math tests.
3. **Deep linking.** `order/[code]`, `[slug]`, Stripe/Connect onboarding return, OTP/magic-link. Configure universal links (iOS) + app links (Android). No web routes to fall back on.
4. **Auth is a rebuild, not a port (verified).** `login.tsx` in the reference repo is a **demo stub** (`signInDemo("customer"|"vendor")`) — there is **no OTP/magic-link flow to port**. Real auth (email OTP via Supabase `signInWithOtp` → `verifyOtp`) must be **built** in P3. Session via SecureStore + `autoRefreshToken`; handle app background/foreground refresh. The `input-otp` UI the plan assumed still fits the 6-digit code screen.
5. **No `localStorage` in RN.** Everything that used it (cart, i18n, notifications prefs) needs an AsyncStorage adapter.
6. **Deno runtime for backend.** Edge Functions aren't Node — Stripe SDK import, env access, and Web APIs differ from the reference TanStack code. Rewrite, don't copy.
7. **Native-only distribution.** Users can't "just open a URL." Every test/demo needs a dev build (EAS/Expo Go limits with native modules like Stripe & maps → likely **dev client**, not Expo Go).
8. **Cron endpoints must be secured (G2).** The reference cron hooks are open POST with no auth. The rebuilt scheduled functions run with service-role → **require a shared-secret header** and reject unauthenticated calls. Never ship them open.
9. **Transactional email is missing, not just unstyled (G3).** The reference only logs. Without a real provider (Resend/Postmark) there is **no order confirmation and no reminder** — a real MVP gap for paying customers, not a polish item.
10. **Fulfillment loop can't close in the customer MVP.** No web + customer-app-first = no QR-scan/collect UI until P8. Decide a stopgap before P6 (see §1.1 + §10).

### 5.1 Fresh start — no legacy data to protect (verified 2026-07-25)

Checked the live DB directly: **3 demo vendors, 13 menu items, 288 slots, and 0 orders / 0 real users / 0 waitlist.** It's all throwaway seed data — **no real customers, no real money.** So this is a **true greenfield**: the old web app is *reference only* and is **not kept running** for anyone.

Decision (§2): **brand-new empty Supabase project.** Apply the copied migrations to it in Phase 1; there is no data to migrate and no live app to avoid breaking. Consequences:
- **No coexistence rules.** Change the schema freely — no "additive-only", no Supabase-branch dance, no dual payment paths, no webhook-overlap trap. All of that only mattered while a live app shared the DB.
- **New Stripe setup too** (test mode first). The old app's Stripe account/webhooks are irrelevant; wire the new project's own keys + one webhook (`payment_intent.succeeded`).
- **Vendors start from zero.** Onboard your first real vendors by hand when ready (§2) — nothing carries over, and nothing needs to.

---

## 6. Global conventions

- **TypeScript strict.** Shared types/zod in `src/shared`; regenerate Supabase types there.
- **No business logic in the client.** Client calls `lib/api-client`; prices/fees/eligibility are always server-authoritative.
- **Design tokens are source of truth.** Port `src/styles.css` oklch tokens into the NativeWind theme once (Phase 1); components use semantic tokens (`bg-primary`, `text-muted-foreground`), never raw values.
- **Expo Dev Client** from the start (Stripe + maps are native modules → Expo Go won't cut it).
- **iOS-first through P8; Android becomes a hard gate at P9.** Booting both simulators every early phase is slow for little gain — verify iOS each phase, do the full Android pass during hardening (P9). (Relaxes the §0a "iOS **and** Android" gate to iOS-only until P9.)
- **Every phase ends green:** typecheck + lint clean, app boots in the iOS simulator, `/code-review` **and** `/security-review` recorded.

### 6a. Tooling — MCP integrations + git workflow (how every phase actually executes)

Claude Code has MCP servers connected for **Supabase**, **GitHub**, **Resend**, and **Vercel**. Phase chats use them directly for infra work — they must not hand the user manual steps for anything a tool below covers.

**⚠️ Two setup traps (verify in Phase 1, before anything else):**
1. MCP servers are configured per repo/user. After creating `slotpass-mobile`, **confirm the Supabase / GitHub / Resend / Vercel MCP tools are available in chats opened in that repo** (copy the MCP config across if needed). If they're missing, every later chat silently degrades to manual work.
2. The Supabase MCP must talk to the **new** project. After Phase 1 creates it, confirm with `list_projects` / `get_project` that the new project ref is reachable — and never point a chat at the old demo project.

**Per-phase tool map:**

| Phase | MCP tools to use |
|---|---|
| P1 | GitHub `create_repository` (private `slotpass-mobile`) · Supabase `list_organizations` → `get_cost` → `confirm_cost` → `create_project` · `apply_migration` (each copied migration, filename order) · `list_tables` (verify) · `get_project_url` + `get_publishable_keys` (fill `EXPO_PUBLIC_*`) · `generate_typescript_types` |
| P2.1 | Supabase `deploy_edge_function` · `execute_sql` (verify data/RLS) · `get_logs` (debug) · `generate_typescript_types` (after any migration) · `get_advisors` (before closing) |
| P2.2 | Same as P2.1. **Stripe has no MCP** — test keys + webhook endpoint are set up by hand in the Stripe dashboard (manual list below) |
| P2.3 | Supabase `deploy_edge_function` + `apply_migration`/`execute_sql` (schedule pg_cron jobs) · **Resend `send-email`** (verify email really sends) · `get_logs` (webhook debugging) |
| P3–P8 | Mostly local app code. Supabase `generate_typescript_types` after any schema change; `get_advisors` before closing any phase that touched the DB; GitHub PR every phase |
| P9 | **Vercel `deploy_to_vercel`** — the tiny static site (landing + privacy policy + `.well-known/apple-app-site-association` for universal links). Same domain carries the Resend DNS |
| P10 | Supabase `get_advisors` (final security + performance pass) · Stripe live keys + live webhook (manual) · store submission via EAS (manual) |

**Manual steps — no MCP covers these; the chat must ask the user, never fake them:**
- **Stripe:** account, test/live API keys, webhook endpoint + signing secret, Connect settings — all via the Stripe dashboard.
- **Supabase function secrets** (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, cron secret): `supabase secrets set` CLI or dashboard — never committed to the repo.
- **Resend sender domain:** choose/buy the domain and add the DNS records Resend shows (the P9 Vercel site uses the same domain).
- **Apple Developer account** ($99/yr) + certificates via EAS; Google Play Console; store listings.

**Git workflow (every phase, no exceptions):**
1. Start from an up-to-date `main`. Create branch `phase-<N>` (e.g. `phase-2.1`).
2. Commit locally as you go with clear messages.
3. At the end: push, open a PR titled `Phase <N>: <title>` (GitHub MCP `create_pull_request` or `gh`), body = the phase's Findings summary.
4. Merge only when all §0a gates pass. The next phase branches from `main` again.

**Code-review reality check:** the chat can run `/code-review high` and `/security-review` itself, but **`/code-review ultra` is user-triggered and billed** — at an ultra gate (P2.2, P2.3, P5, P6, P8) the chat stops and asks the user to type it, then processes the findings. A chat must never claim an ultra review ran when it didn't.

---

## 7. API contract (living document — update as phases build it)

Frontend codes against these logical endpoints via `lib/api-client` (mock in Phase 3, live Edge Functions from the backend track).

| Endpoint | Purpose | Source spec | Status |
|---|---|---|---|
| `listVendors(filters)` | Landing list + map markers | `routes/index.tsx` | ⬜ |
| `getVendorBySlug(slug)` | Vendor detail, menu, slots, waitlist state | `routes/$slug.tsx` | ⬜ |
| `getSlots(vendorId, date)` | Available slots + dynamic price | `$slug.tsx` + `apply-dynamic-pricing` | ⬜ |
| `joinWaitlist(...)` / `leaveWaitlist(...)` | Waitlist lifecycle | `$slug.tsx` | ⬜ |
| `applyPromo(code, cart)` | Validate/return discount | `promo.functions.ts` | ⬜ |
| `createPaymentIntent(cart)` | **Replaces Checkout Session**; returns `client_secret`; server recomputes totals/fees/commission; reserves priority seat + decrements stock (rollback on fail) | `checkout.functions.ts` | ⬜ |
| `claimWaitlistOffer(entryId)` | Validate an active waitlist offer before payment | `checkout.functions.ts`, `claim_waitlist_offer` | ⬜ |
| `getOrders()` / `getOrderByCode(code)` | Order history + detail (+QR payload) | `orders.tsx`, `order.$code.tsx` | ⬜ |
| `refundOrder(orderId)` / `cancelOrder(code)` | **⛔ Post-MVP (§11).** Admin refunds manually via Stripe dashboard for now | _new — no reference_ | ⛔ deferred |
| `markOrderCollected(qrTokenOrCode)` | **⛔ Post-MVP (§11).** No scan UI in customer MVP; pickup handled out-of-band | `vendor.tsx` (collect flow) | ⛔ deferred |
| `getVendorDashboard(...)` / slot CRUD | Vendor ops + analytics | `vendor.tsx` | ⬜ |
| `createConnectOnboardingLink()` / `getConnectStatus()` / `getVendorEarnings(range)` | Stripe Connect onboarding (deep-link return), status refresh, earnings + payout history | `connect.functions.ts`, `become-vendor.tsx` | ⬜ |
| **Backend-internal:** `stripe` webhook (**`payment_intent.succeeded`**, not `checkout.session.completed`), `stripe-connect` webhook, cron `apply-dynamic-pricing` / `mark-no-shows` / `send-reminders` — **all secret-gated (G2)** | Not client-called; pg_cron / Stripe triggered | `api/public/*` | ⬜ |

---

## 8. Phases

> Each phase = **one chat**. Do only your phase, then fill Findings + Code Review + update §9.

### Phase 1 — New Expo repo + design tokens + dev client
**Status:** ⬜ Not started · **Depends on:** — · **Review:** `/code-review high`

**Goal:** A booting, themed Expo app (dev client) in the new `slotpass-mobile` repo.

**Tasks**
- Create **private GitHub repo `slotpass-mobile`** via GitHub MCP (`create_repository`); scaffold Expo + Expo Router + TypeScript (strict).
- Install & wire **NativeWind**; port `src/styles.css` oklch tokens (light/dark) into `src/theme` + `tailwind.config.js`.
- Scaffold **react-native-reusables** base + a smoke Button using tokens.
- Create a **brand-new empty Supabase project** via Supabase MCP (`get_cost` → `confirm_cost` → `create_project`); fill **EXPO_PUBLIC_*** env from `get_project_url` + `get_publishable_keys`.
- Configure **Expo Dev Client** (Stripe/maps need native modules); confirm the iOS simulator boots (Android is a P9 gate — §6).
- Copy `supabase/migrations` from the reference repo and **apply them to the new project** via Supabase MCP `apply_migration` (filename order); verify with `list_tables`; run `get_advisors`. Init `supabase/functions/`.
- **Verify the §6a MCP traps:** all four MCP servers reachable from chats in the new repo; Supabase MCP sees the NEW project ref.
- Move this `REACT_NATIVE_MIGRATION.md` + `README_MIGRATION.md` into the new repo. Root scripts: `dev`, `typecheck`, `lint`.

**Done when:** Dev client boots on **iOS** showing a themed screen using semantic tokens; migrations applied to the new Supabase project; typecheck + lint clean. (Android is a P9 gate — §6.)

**📝 Findings / What was built:** _(fill in)_
**✅ Code Review:** _(fill in)_

---

### Phase 2 — Backend rebuild: Supabase Edge Functions (the backend track)

> **Why split:** the reference backend is large and money-critical. Building it as one chat is unworkable, so Phase 2 runs as **four independently-shippable sub-phases**. Each ends green (typecheck + tests + review). Downstream phases depend on specific sub-phases, not all of Phase 2: **P5 → P2.1**, **P6 → P2.2**, **P7 → P2.3**. (P2.4 fulfillment/refunds is **deferred → §11**.)
>
> **Universal rules for every sub-phase (from §1.1 + §5–§6):** Deno rewrite (never copy Node); **server-authoritative** money math (client sends only ids + quantities); shared zod contracts in `src/shared`; each function verified against its reference spec. Secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, cron secret, email API key) live in Supabase function secrets, never in the repo.

---

#### Phase 2.1 — Read/catalog + foundation
**Status:** ⬜ Not started · **Depends on:** P1 · **Review:** `/code-review high`

**Goal:** The read-side API the customer app browses against, plus the shared contract scaffold.

**Tasks**
- Finalize §7 request/response **zod schemas** in `src/shared`; regenerate Supabase types.
- Edge Functions (or RLS-direct where a plain query suffices — decide per endpoint): `listVendors`, `getVendorBySlug`, `getSlots` (incl. effective dynamic price), waitlist read state.
- `claimWaitlistOffer` (wraps `claim_waitlist_offer`), `applyPromo` (wraps `validate_promo_code`, server-computed discount).
- Local Supabase + Edge runtime harness so functions can be invoked in dev.
- Deploy with Supabase MCP `deploy_edge_function`; debug with `get_logs`; `generate_typescript_types` after any migration; `get_advisors` before closing (§6a).
- **Settle the order-ownership model (mandatory accounts).** The reference links orders to a customer by **email** (`orders_link_customer`) and allows guest checkout. Since accounts are now mandatory, add a `user_id` on orders + RLS so `getOrders()` returns only the signed-in user's orders. Greenfield (§5.1) — there is no live app to protect, so shape the migration however is cleanest. This is a data-model change, so it belongs here, not in P6.
- **Decide how `src/shared` is shared — it isn't free.** Edge Functions run in **Deno** (URL / `npm:` imports, explicit file extensions); the app bundles via **Metro**. A single module imported by both fights the bundlers. Simplest safe path for a beginner: **keep the zod schemas duplicated (or codegen them), not a shared import.** Write the decision in Findings so later phases don't rediscover it.

**Done when:** Customer app can list vendors, open a vendor, read slots/prices, apply a promo, and claim a waitlist offer — all via `functions.invoke()` / RLS, typed end-to-end.

**📝 Findings / What was built:** _(fill in)_
**✅ Code Review:** _(fill in)_

---

#### Phase 2.2 — Payments: `createPaymentIntent` + Connect (the money core)
**Status:** ⬜ Not started · **Depends on:** P2.1 · **Review:** `/code-review ultra`

**Goal:** A PaymentSheet-ready payment path with full server-side recomputation, matching `checkout.functions.ts` exactly.

**Tasks**
- `createPaymentIntent`: recompute subtotal/discount/promo/commission/service-fee + priority upcharge server-side; validate vendor `charges_enabled`, slot capacity/open, per-item availability; **atomic stock decrement with rollback**; reserve priority seat; record promo redemption; mark waitlist entry claimed. Persist order `pending` with all fee snapshots.
- Create the **PaymentIntent** with `transfer_data.destination` + `application_fee_amount` (destination charge) + `automatic_payment_methods` (iDEAL/cards/wallets); return `client_secret` + `orderCode`.
- Connect endpoints: `createConnectOnboardingLink`, `getConnectStatus`, `getVendorEarnings` (spec: `connect.functions.ts`); deep-link `return_url`/`refresh_url`.
- **Money-math tests**: fees, commission, item & slot discounts, promo cap, priority upcharge, dynamic-price precedence (`max(manual, auto)`), rollback-on-sellout.
- **Stripe setup is manual (no MCP — §6a):** ask the user for test-mode keys from the Stripe dashboard; store them via `supabase secrets set`, never in the repo.

**Done when:** A real test-mode PaymentIntent can be created and confirmed from a test client; every fee/commission/discount matches the reference math under test.

**📝 Findings / What was built:** _(fill in)_
**✅ Code Review:** _(fill in)_

---

#### Phase 2.3 — Webhooks, cron & real notifications
**Status:** ⬜ Not started · **Depends on:** P2.2 · **Review:** `/code-review ultra`

**Goal:** Close the payment loop and fix the security + notification gaps (G2, G3).

**Tasks**
- `stripe` webhook: verify signature; handle **`payment_intent.succeeded`** (not `checkout.session.completed`) → idempotent `pending → paid`, snapshot fees, bump `slot.orders_count`. Add `payment_intent.payment_failed` → release stock/priority seat.
- `stripe-connect` webhook: sync `charges_enabled` / `payouts_enabled` / `details_submitted`.
- Cron as **scheduled functions / pg_cron + pg_net**, each **secret-gated (G2)**: `apply-dynamic-pricing`, `mark-no-shows`, `send-reminders`.
- **Real transactional email (G3):** wire **Resend**; order confirmation on paid + reminder from `send-reminders`. Replace the `console.log` stub. Verify with a real send via the Resend MCP (`send-email`); the sender domain + DNS is a manual prerequisite (§6a) — ask the user before starting.

**Done when:** Paying flips the order to `paid` via webhook; a confirmation email arrives; cron jobs run on schedule and reject unauthenticated calls; no-shows are marked after grace.

**📝 Findings / What was built:** _(fill in)_
**✅ Code Review:** _(fill in)_

---

#### Phase 2.4 — Fulfillment + refunds — ⛔ OUT OF CURRENT SCOPE
**Status:** ⛔ Deferred → **§11 To be built** · **Depends on:** — · **Review:** —

Both pieces are deliberately **not** in the customer MVP (decided 2026-07-25):
- **Fulfillment (`markOrderCollected` + vendor scan UI):** no web app and no vendor RN app in this scope → order collection is handled out-of-band in the pilot. Full spec in §11.
- **Refunds/cancellation:** admin handles rare cases manually via the **Stripe dashboard**; no `refundOrder`/`cancelOrder` endpoint is built now. Full spec in §11.

_Kept as a numbered slot so the phasing stays stable; do not build until promoted from §11._

---

### Phase 3 — Mobile core infra: api-client, auth, supabase, i18n, providers
**Status:** ⬜ Not started · **Depends on:** P1 (P2 optional — mocks unblock) · **Review:** `/code-review high`

**Tasks**
- `lib/api-client`: typed client with **mock + live** implementations (env-switchable).
- Supabase RN client with **SecureStore** session adapter + `autoRefreshToken` + app-state refresh.
- **Build email-OTP auth** (Supabase `signInWithOtp` → `verifyOtp`) with r-n-reusables input-OTP. ⚠️ `login.tsx` is only a demo stub (`signInDemo`) — this is **new work, not a port**. (Email OTP = a 6-digit code by email; no deep link needed. Chosen over magic-link so P3 doesn't depend on universal-link setup.)
- Port **i18n** provider (AsyncStorage adapter); `LanguageToggle`.
- React Query provider, RN error boundary, toast host, Expo Router `_layout` + `Header` + nav skeleton.

**Done when:** Log in via OTP, session survives restart, language toggles, screens fetch via api-client (mock or live).

**📝 Findings / What was built:** _(fill in)_
**✅ Code Review:** _(fill in)_

---

### Phase 4 — Design system parity (component library)
**Status:** ⬜ Not started · **Depends on:** P1 · **Review:** `/code-review high`

**Tasks**
- Inventory `components/ui/*` imported by customer routes; build only those first.
- Port to r-n-reusables: button, card, input, label, form, badge, tabs, select, skeleton, dialog→**modal**, sheet/drawer→**bottom-sheet**, sonner→**toast**, separator, avatar, progress, alert. (Defer table/sidebar/menubar/chart to P8.)
- `StarRating`, `Header`, `LanguageToggle`. Verify light + dark.

**Done when:** Customer routes can be built entirely from the component library; light/dark parity.

**📝 Findings / What was built:** _(fill in)_
**✅ Code Review:** _(fill in)_

---

### Phase 5 — Customer flow: landing + vendor detail (maps, cart)
**Status:** ⬜ Not started · **Depends on:** P3, P4 · **Review:** `/code-review ultra`

**Tasks**
- Port `index.tsx` (landing, vendor list, map) and `$slug.tsx` (detail, menu, slots, waitlist).
- **Maps:** react-native-maps (markers, vendor pins) — native only.
- Port **cart** (`lib/cart.tsx`) with AsyncStorage adapter.

**Done when:** Browse → open vendor → add items → cart persists; map renders on iOS. (Android is a P9 gate — §6.)

**📝 Findings / What was built:** _(fill in)_
**✅ Code Review:** _(fill in)_

---

### Phase 6 — Customer flow: checkout + payment
**Status:** ⬜ Not started · **Depends on:** P2.2 (payment) + P2.3 (webhook confirm), P5 · **Review:** `/code-review ultra`

**Tasks**
- Port `checkout.tsx` UI (details, priority, waitlist, promo).
- Integrate **Stripe PaymentSheet** against `createPaymentIntent`; totals are server-returned.
- **Set PaymentSheet `returnURL`** (a custom URL scheme, e.g. `slotpass://stripe-redirect`) — **required** so redirect methods like **iDEAL** come back to the app. Cards don't need it, but NL customers will expect iDEAL, so do it here.
- **Wallets deferred:** **Apple Pay / Google Pay** need extra native setup (Apple merchant ID, Stripe config plugin in `app.json`, Google Pay config). **Not required for the first purchase → do them in P9.** Don't block checkout on wallet setup.
- `applyPromo`; confirmation via app state/deep link → order screen.

**Done when:** Real end-to-end payment succeeds on iOS (test mode) with **card and iDEAL**; order created; confirmation shown. (Android verified in P9.)

**📝 Findings / What was built:** _(fill in)_
**✅ Code Review:** _(fill in)_

---

### Phase 7 — Customer flow: orders + order detail (QR, notifications)
**Status:** ⬜ Not started · **Depends on:** P5, P6, P2.3 (email/reminders) · **Review:** `/code-review high`

**Tasks**
- Port `orders.tsx` + `order.$code.tsx`; **QR** via react-native-qrcode-svg (pickup code).
- **expo-notifications** (APNs/FCM) for reminders/status; tie to backend `send-reminders`.

**Done when:** View orders, open an order, see QR + live status; push notifications deliver on device.

**📝 Findings / What was built:** _(fill in)_
**✅ Code Review:** _(fill in)_

---

### Phase 8 — Vendor + admin + become-vendor
**Status:** ⬜ Not started · **Depends on:** P4, P7 (+ builds the §11 collect/refund endpoints it needs) · **Review:** `/code-review ultra`

**Tasks**
- Port `vendor.tsx` (1,319 LOC): dashboard, slot CRUD, order mgmt, analytics (`DeepAnalyticsCard`, recharts → victory-native).
- Port `admin.tsx`.
- Port `become-vendor.tsx`: **Stripe Connect onboarding** via `createConnectOnboardingLink` with **deep-link return**.
- Port remaining `components/ui/*` (table, chart, etc.) needed here.

**Done when:** Vendor + admin + Connect onboarding have native parity.

**📝 Findings / What was built:** _(fill in)_
**✅ Code Review:** _(fill in)_

---

### Phase 9 — Native build hardening + store readiness (EAS)
**Status:** ⬜ Not started · **Depends on:** P7 (P8 for full parity) · **Review:** `/code-review high`

**Tasks**
- **EAS** build profiles (dev/preview/production), app icons, splash, fonts.
- Deep links / universal links (iOS) + app links (Android) end-to-end.
- Push credentials (APNs key, FCM); notification categories.
- Performance pass (list virtualization, image caching, bundle/startup).
- Error reporting/analytics (replace Lovable error reporting with e.g. Sentry).
- **Tiny static site via Vercel MCP** (`deploy_to_vercel`): landing + **privacy policy** (App Store requirement) + `.well-known/apple-app-site-association` for universal links. Same domain carries the Resend DNS records (§2 Web presence, §6a).
- Store metadata, privacy manifests, permissions strings (location, camera, notifications).

**Done when:** Signed iOS + Android builds via EAS install on device; deep links + push verified.

**📝 Findings / What was built:** _(fill in)_
**✅ Code Review:** _(fill in)_

---

### Phase 10 — Launch + decommission old web app
**Status:** ⬜ Not started · **Depends on:** P8, P9 · **Review:** `/code-review high`

**Tasks**
- Submit to App Store + Google Play; staged rollout.
- **Decommission is trivial** (greenfield — §5.1): the old web app never served real users, so just stop referencing the old repo and remove any leftover Lovable deploy. No data migration, no cutover window.
- Flip the new Stripe project from test to live keys; verify the `payment_intent.succeeded` webhook + cron secrets are set in the new project.
- Final Supabase `get_advisors` pass (security + performance) before going live (§6a).
- Final regression across all flows and roles; document the new architecture.

**Done when:** App live on both stores; old web stack decommissioned; all flows verified.

**📝 Findings / What was built:** _(fill in)_
**✅ Code Review:** _(fill in)_

---

## 9. Progress tracker

| Phase | Title | Status |
|---|---|---|
| 1 | New Expo repo + tokens + dev client | ⬜ Not started |
| 2.1 | Backend: read/catalog + contract foundation | ⬜ Not started |
| 2.2 | Backend: payments (createPaymentIntent + Connect) | ⬜ Not started |
| 2.3 | Backend: webhooks, cron & real email | ⬜ Not started |
| 2.4 | Backend: fulfillment + refunds | ⛔ Deferred → §11 |
| 3 | Mobile core infra (api-client, auth, i18n) | ⬜ Not started |
| 4 | Design system parity | ⬜ Not started |
| 5 | Customer: landing + vendor detail | ⬜ Not started |
| 6 | Customer: checkout + payment | ⬜ Not started |
| 7 | Customer: orders + order detail | ⬜ Not started |
| 8 | Vendor + admin + become-vendor | ⬜ Not started |
| 9 | Native build hardening + EAS | ⬜ Not started |
| 10 | Launch + decommission web | ⬜ Not started |

---

## 10. Open questions to resolve as we go

**Resolved (2026-07-25) — now in Locked Decisions (§2):**
- ✅ **Fulfillment** — deferred out of scope → §11 (out-of-band pickup in the pilot).
- ✅ **Refunds/cancellation** — out of MVP; admin uses Stripe dashboard → §11.
- ✅ **Email provider** — Resend.
- ✅ **Accounts** — mandatory account before ordering (no guest checkout).
- ✅ **Cron** — Supabase `pg_cron` + `pg_net` → secret-gated Edge Functions.

**Still open — non-blocking, resolve as we go:**
- **Push scope** — transactional only, or marketing too? APNs/FCM ownership. (by P7)
- **Vendor/admin native vs. staying web** — native parity, or a slimmed staff back-office? (ties to §11 fulfillment; revisit before P8)
- **Expo Go vs. Dev Client** — confirmed Dev Client due to Stripe/maps native modules. (P1)
- **Analytics/error tool** — Sentry vs. alternative. (by P9)
- **Resend sender domain + DNS** — which domain sends mail; who owns DNS. Same domain later hosts the P9 Vercel site (§2 Web presence), so ideally choose/buy it before P2.3. (before P2.3)

---

## 11. To be built — out of current MVP scope

> Explicitly **not** in the customer-MVP scope (Phases 1–7). Captured here so nothing is lost. Promote an item into a real phase when we decide to build it. **Consequence for the pilot:** the paid → collected loop is *not* closed in-app; orders are handed over out-of-band and age out via the `mark-no-shows` cron.
>
> ⚠️ **Side effect to accept knowingly:** with no collect UI, an order that *was* picked up is never flipped to `collected`, so it looks identical to a genuine no-show — `mark-no-shows` will mark **real, honoured orders as no-shows**. Fine for the pilot, but **don't use no-show counts for vendor penalties or analytics** until fulfillment (below) ships.

| Item | What it needs | Blocked by / notes |
|---|---|---|
| **Order fulfillment UI + `markOrderCollected`** | Vendor scans QR / enters `order_code` → flip `paid → collected`, staff-authorized, guard double-collect & no-show race. Backend endpoint + a vendor surface. | Needs a vendor surface (web back-office or vendor RN app). Lands with **Phase 8** or a dedicated mini-phase. |
| **Refunds & cancellation** | `refundOrder` (Stripe Refund reversing transfer + application fee, restore stock/priority seat, email customer) + optional `cancelOrder` with a cutoff-window policy. | For now admin refunds manually via Stripe dashboard. Define cutoff policy when promoted. |
| **Vendor RN app** | Native dashboard, slot/menu CRUD, order mgmt, earnings — currently sequenced as Phase 8. | Decide native vs. thin web back-office first. |
| **Admin RN app** | Vendor-application approval, review moderation, vendor management. | Same decision as above. |
| **Marketing / push beyond transactional** | Campaign push, promo pushes. | After transactional push (P7). |

**When picking any of these up:** re-open the relevant §10 question, add a numbered phase with Depends-on + Done-when, wire it into §7 and §9, then build.

---

## 12. Working backlog — discovered TODOs & considerations (APPEND-ONLY)

> **Every phase chat MUST append here.** Whenever you hit something during your session that is
> real but **out of your phase's scope** — a bug, tech debt, a risky assumption, a follow-up, a
> "someone should decide X", a missing test — log it here instead of silently fixing it (scope
> creep) or forgetting it (drift). This is the shared memory that stops the same issue being
> rediscovered every phase.
>
> **Rules for entries:**
> - Append; don't rewrite or delete others' entries. To resolve one, set Status `✅ Done` /
>   `❌ Won't do` and add a one-line note — leave the row.
> - If an item is really a new feature out of MVP, move it to **§11** instead.
> - If it changes a decision, also flag it in **§10**.
> - Keep each entry one line. Link a phase.
>
> **Type:** `TODO` (do later) · `DEBT` (shortcut taken, revisit) · `CONSIDER` (decision/eval needed) · `BUG` · `TEST` (missing coverage) · `RISK`
> **Priority:** `P1` blocker-ish · `P2` should-do · `P3` nice-to-have

| # | Found in | Type | Prio | Item | Status |
|---|---|---|---|---|---|
| B1 | Planning | CONSIDER | P2 | Fulfillment/pickup loop not closed in customer MVP — decide stopgap before P6 ships (see §10, §11). | ⬜ Open |
| B2 | Planning | RISK | P1 | ~~Live web app shares prod DB~~ → **N/A: greenfield, brand-new empty Supabase project, no live app shares the DB (§5.1).** | ❌ Won't do |
| B3 | Planning | RISK | P1 | ~~webhook overlap with old Checkout Sessions~~ → **N/A: old app not running; single payment path on the new project (§5.1).** | ❌ Won't do |
| B4 | Planning | DEBT | P2 | Auth is a rebuild, not a port — `login.tsx` is a demo stub (`signInDemo`); build email-OTP in P3 (§5.4, P3). | ⬜ Open |
| B5 | Planning | CONSIDER | P2 | Mandatory accounts change order ownership (email/guest → `user_id` + RLS); settle in P2.1 (§2, P2.1). | ⬜ Open |
| B6 | Planning | RISK | P2 | `src/shared` not free across Deno (Edge) vs Metro (app) — duplicate/codegen zod, don't force one shared import (P2.1). | ⬜ Open |
| B7 | Planning | TODO | P3 | Onboard the first real vendors by hand until P8 self-serve onboarding (greenfield — nothing carries over from demo data) (§2). | ⬜ Open |
| _add below_ | | | | | |

