# SlotPass — End-to-End Backend Analyse & Architectuur-nulmeting

_Opgesteld: 2026-07-25 · Scope: huidige codebase op `main` (commit `d13768b`) · Doel: bepalen wat er staat, wat gedekt is, en wat er nodig is voor een **React Native MVP op Supabase + Stripe**._

---

## 0. TL;DR — mijn eerlijke oordeel

**Ja, er ís een duidelijke architectuur — en die is verrassend volwassen.** Dit is geen half-af Lovable-prototype: de betaalflow gebruikt Stripe Connect destination charges met application fees, prijzen/kortingen/commissie worden server-side herberekend (client-input wordt niet vertrouwd), er is voorraadbeheer met rollback, een waitlist, priority-tiers, promocodes, dynamic pricing via cron, en RLS op alle tabellen. Dat is doordacht werk.

**Maar er is één fundamenteel probleem voor jouw doel:** de hele backend-logica leeft in **TanStack Start server functions** (`createServerFn`) en **API-routes** binnen de web-app. Dat is een Node-webserver-runtime. **Een React Native app kan `createServerFn` niet aanroepen** — die RPC-laag is vastgeklonken aan de web-bundle. Er is dus géén los aanspreekbare, mobiel-klare API-laag.

> **Kernconclusie:** De *business-logica* is grotendeels gedekt en goed. De *architectuur-vorm* (waar die logica draait) is niet herbruikbaar voor React Native zonder een bewuste her-huisvesting. Dat is de belangrijkste beslissing die we samen moeten nemen vóór we bouwen — zie **§6 Open beslissingen**.

---

## 1. Wat is de app? (purpose & flow)

**SlotPass = "skip the line" pre-order voor food-vendors.** Klanten bestellen vooraf voor een tijdslot, betalen via Stripe, en halen op met een QR-code. Vendors vullen rustige slots door off-peak korting. Het platform pakt een service fee + commissie.

**Drie personas:**
- **Klant (gast of account):** browse vendors → menu → cart → checkout → betaal → QR → ophalen.
- **Vendor-staff:** dashboard, slots/menu beheren, Stripe Connect onboarden, orders scannen/afvinken, earnings zien.
- **Platform-admin:** vendor-aanvragen goedkeuren/afwijzen, reviews modereren, vendors beheren.

**Happy-path bestelflow (zoals nu geïmplementeerd):**
```
browse (/)  →  vendor menu (/$slug)  →  cart  →  /checkout
   → createCheckoutSession (server fn): valideert vendor/slot/voorraad,
     herberekent prijzen, maakt order (status=pending), maakt Stripe Checkout Session
   → Stripe hosted checkout (iDEAL/kaart/wallets)
   → webhook /api/public/webhooks/stripe: checkout.session.completed → order=paid, slot.orders_count++
   → /order/$code: toont QR (qr_token)
   → vendor scant QR → order=collected  |  cron mark-no-shows → no_show na grace-tijd
```

---

## 2. Architectuur zoals-die-nu-is

```
┌─────────────────────────── TanStack Start web-app (Node runtime) ───────────────────────────┐
│                                                                                              │
│  React 19 SPA/SSR  ──►  createServerFn RPC's        ──►  API-routes (webhooks + cron hooks)  │
│  (routes/*.tsx)         checkout.functions.ts            /api/public/webhooks/stripe(.ts)    │
│                         connect.functions.ts             /api/public/webhooks/stripe-connect │
│                         promo.functions.ts               /api/public/hooks/* (3x cron)       │
│                         stripe.server.ts (Stripe SDK)                                         │
│                              │                                │                               │
│           supabaseAdmin (service-role, bypass RLS)  ─────────┘                               │
└──────────────────────────────────┬───────────────────────────────────────────────────────── ┘
                                    │
                    ┌───────────────▼───────────────┐        ┌──────────────┐
                    │   Supabase Postgres            │        │    Stripe    │
                    │   • 15+ tabellen, RLS overal   │        │  Connect +   │
                    │   • RPC's (SECURITY DEFINER)   │        │  Checkout    │
                    │   • triggers (rating, stock…)  │        └──────────────┘
                    │   • pg_cron → POST cron hooks  │
                    └────────────────────────────────┘
```

**Belangrijk:** Supabase wordt hier gebruikt als *database + auth*, **niet** als applicatie-backend. Er zijn **geen Supabase Edge Functions** (`supabase/functions/` bestaat niet). Alle server-logica is TanStack. De "backend" = de web-app zelf.

---

## 3. Datamodel (gedekt — dit is sterk)

15+ tabellen, alle met RLS. Kern:

| Domein | Tabellen |
|---|---|
| Catalogus | `vendors`, `categories`, `menu_items`, `item_slot_discounts` |
| Capaciteit | `slots` (capacity, orders_count, discount, priority-tier, stock) |
| Bestellen | `orders`, `order_items` (status: pending→paid→collected/no_show) |
| Vendor-lifecycle | `vendor_applications` (wizard-drafts), `staff`, `user_roles` (RBAC via `has_role`/`app_role`) |
| Groei/retentie | `reviews` (+ rating-trigger), `waitlist_entries`, `promo_codes`, `promo_redemptions`, referral-codes |
| Pricing | `pricing_rules` (dynamic pricing) |

**RPC's / triggers aanwezig:** `approve_vendor_application`, `reject_vendor_application`, `validate_promo_code`, `decrement_stock` (+ rollback), `reset_daily_stock`, `claim_waitlist_offer`, `promote_waitlist`, `get_order_by_code`, `refresh_vendor_rating`, `orders_link_customer`, `touch_updated_at`.

**Oordeel:** Het datamodel is MVP-klaar en dan wat. Dit hoeft grotendeels niet opnieuw — het verhuist gewoon mee, ongeacht welke API-laag we kiezen.

---

## 4. Backend-dekking: wat staat er, wat niet

Legenda: ✅ gedekt · 🟡 gedeeltelijk / stub · ❌ ontbreekt

| Capability | Status | Waar / opmerking |
|---|---|---|
| Auth (email/password) | ✅ | Supabase Auth; RN kan dit direct gebruiken |
| Vendor/menu/slot lezen | ✅ | RLS `select using(true/is_active)` — RN kan direct queryen |
| Checkout + Stripe Connect | ✅ | `checkout.functions.ts` — **maar TanStack-gebonden** |
| Stripe webhook (paid) | ✅ | signature-verified, idempotent |
| Connect onboarding + earnings | ✅ | `connect.functions.ts` — **TanStack-gebonden** |
| Promocodes / referrals | ✅ | RPC + server fn |
| Waitlist claim/promote | ✅ | RPC's aanwezig |
| Voorraad (stock) | ✅ | atomic decrement + rollback |
| Dynamic pricing | ✅ | cron hook + `pricing_rules` |
| No-show detectie | ✅ | cron hook |
| **Mobiel-aanroepbare API** | ❌ | **geen; alles is `createServerFn`** — kern-blocker RN |
| **E-mail/SMS notificaties** | 🟡 | `notifications.ts` is een **stub** (`console.log`, geen sender-domein) |
| **Cron-endpoint beveiliging** | ❌ | `/api/public/hooks/*` zijn **open POST zonder secret** (zie §5) |
| Push-notificaties | ❌ | niets; RN wil dit vrijwel zeker (order-ready, reminders) |
| Order-realtime voor vendor | 🟡 | polling in dashboard; geen Supabase Realtime-subscriptie |
| Refunds / annuleringen | ❌ | geen refund-pad; alleen no-show markering |
| Env-secrets lokaal | 🟡 | `.env` mist `STRIPE_*` en `SERVICE_ROLE_KEY` (Lovable Cloud injecteert ze) → lokaal geen Stripe |
| Tests | ❌ | geen enkele test in de repo |

---

## 5. Findings & risico's (gerangschikt op impact)

**F1 — [BLOKKEREND voor RN] Business-logica zit vast in TanStack server functions.**
`createServerFn` is een web-RPC; React Native heeft geen client die dit aanroept. Checkout, Connect, promo, earnings moeten opnieuw gehuisvest worden (Edge Functions óf een blijvende HTTP-API). Dit is dé architectuurbeslissing. *Impact: hoog. Inspanning: middel-hoog.*

**F2 — [SECURITY] Cron-hooks zijn onbeveiligde open endpoints.**
`/api/public/hooks/{apply-dynamic-pricing,mark-no-shows,send-reminders}` doen geen enkele authenticatie en draaien intern met de service-role. Iedereen die de URL kent kan ze triggeren. Idempotent, dus schade beperkt — maar `mark-no-shows` extern spammen kan wel legitieme orders vervroegd op no-show zetten als timing net klopt. *Fix: shared-secret header. Impact: middel. Inspanning: laag.*

**F3 — [FUNCTIONEEL GAT] Notificaties zijn een stub.**
`sendReminderEmail` logt alleen en retourneert `sent:true` (zodat de scheduler niet blijft retryen). Er gaat dus **geen enkele e-mail/SMS** uit — geen orderbevestiging, geen reminder, geen "klaar om op te halen". Voor een MVP met betalende klanten is dat een echt gat. *Impact: hoog voor UX. Inspanning: laag-middel (Resend/Postmark koppelen).*

**F4 — [RN-GAT] Geen push-notificaties.**
Een mobiele app zonder push mist de belangrijkste mobiele hook (order-status, reminder). Niet in de huidige backend voorzien. *Impact: middel-hoog. Inspanning: middel.*

**F5 — [ROBUUSTHEID] Geen refund/annulering-pad.**
Betaald maar vendor kan niet leveren, of klant annuleert → nu geen flow. Alleen no-show → geld blijft staan. *Impact: middel (support-last, chargebacks). Inspanning: middel.*

**F6 — [OPS] Geen tests, geen secret-management lokaal.**
Nul tests op geld-rakende logica; Stripe draait niet lokaal omdat secrets in Lovable Cloud zitten. *Impact: laag-middel. Inspanning: laag om te starten.*

**F7 — [BESLISSING] "Skip-the-line" claim vs. QR-pickup realiteit.**
De QR wordt getoond op `/order/$code` en vendor scant handmatig. Prima voor MVP, maar er is geen echte "voorrang in de rij"-mechaniek behalve de priority-tier upcharge. Waard om te bevestigen dat dit het bedoelde product is. *Impact: product. Inspanning: n.v.t.*

---

## 6. Vastgelegde beslissingen (2026-07-25)

| Beslissing | Keuze |
|---|---|
| **API-laag** | **Supabase Edge Functions** (Deno). Logica verhuist uit TanStack; RN roept aan via `supabase.functions.invoke()`. |
| **MVP-scope** | **Alleen klant-app** (browse → bestellen → betalen → QR). |
| **Web-app** | **Vervalt volledig** — native iOS/Android is het enige product. |
| **Payments** | **Native Stripe React Native SDK** (PaymentSheet + PaymentIntents). |
| Accounts | _Nog te bevestigen_ — RN + push + orderhistorie pleit voor verplichte accounts i.p.v. gast-checkout. |

### 6.1 Nieuw blootgelegde tegenstrijdigheid (moet nog beslist)
**Geen web-app + alleen klant-app = geen thuis voor QR-scan en vendor-goedkeuring.** De ophaal-loop sluit dan niet: klant betaalt, maar de vendor kan de order nergens afvinken, en admin kan geen aanvragen goedkeuren. Opties:
- **(a)** Minimale web-admin/vendor tijdelijk behouden (alleen scannen + approve) — snelste MVP.
- **(b)** Vendor QR-scan als fase-2 RN-app, direct na de klant-MVP.
- **(c)** Pilot zonder scan-UI: vendor vinkt af op de 6-cijferige `order_code`.

_→ Advies: (a) voor de pilot, (b) als roadmap. "Geen web-app" geldt dan puur voor de klant-ervaring._

---

## 7. TODO — route naar RN MVP (voorlopig, hangt af van §6)

**Fase 0 — Fundament & beslissingen**
- [ ] §6-beslissingen vastleggen (API-huisvesting, scope, payments, accounts)
- [ ] F2 fixen: shared-secret op cron-hooks (los van RN, gewoon dichttimmeren)
- [ ] Secrets-strategie voor lokaal + RN-env

**Fase 1 — Mobiel-klare API-laag**
- [ ] Gekozen aanpak (A/B/C) opzetten; `createCheckoutSession` als eerste endpoint her-huisvesten
- [ ] Connect-onboarding + earnings endpoints beschikbaar maken voor RN
- [ ] Contract/types delen tussen RN en backend (zod/`types.ts` hergebruiken)

**Fase 2 — RN-app skeleton**
- [ ] Expo/RN project, Supabase-auth (deep-link redirect), navigatie
- [ ] Browse → menu → cart → checkout (webview óf native PaymentSheet)
- [ ] Order-scherm met QR + orderhistorie (accounts)

**Fase 3 — Gaten dichten**
- [ ] F3: echte e-mail (order confirm + reminder) via Resend/Postmark
- [ ] F4: push-notificaties (Expo push) voor order-status/reminder
- [ ] F5: refund/annulering-pad
- [ ] (indien in scope) vendor-app: QR-scan + order-afhandeling

**Fase 4 — Hardening**
- [ ] Tests op checkout/webhook/promo (geld-rakende paden)
- [ ] Realtime order-updates voor vendor i.p.v. polling

---

## 8. Wat NIET opnieuw hoeft
Datamodel, RLS, RPC's, Stripe Connect-integratie-logica, prijs/korting/commissie-berekening, waitlist/promo/pricing-mechaniek. Dit is de waarde die blijft — ongeacht welke API-laag we kiezen. We verplaatsen het, we herschrijven het niet.
