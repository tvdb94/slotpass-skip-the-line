# SlotPass → Native — How to run this migration

This is the operating manual for the React Native rebuild. The full plan lives in
**`REACT_NATIVE_MIGRATION.md`**. This file tells you how to *drive* it, one phase per chat,
without letting a build run away on invented code.

> From **Phase 1** onward, both this file and the plan live in the new repo `slotpass-mobile/`.
> Until then they live here (the reference repo).

---

## The idea in one paragraph

The plan is split into **10 phases**. You build **one phase per chat**. Each chat reads the plan,
does only its phase, writes back what it built and what it decided into the plan's Findings
section, then **runs `/code-review` as a mandatory gate** before the phase can be called done.
The plan file is the shared memory between chats — a fresh chat has no context except what the
plan holds, which is exactly why every phase must record its choices there.

---

## Prerequisites (once)

- Keep this reference repo (`slotpass-skip-the-line`) checked out next to the new one — phases
  read it for business rules (checkout math, promo, dynamic pricing) and design tokens.
- A **brand-new empty Supabase project** is created in Phase 1 (via the Supabase MCP) — the old
  project holds only demo data and is **never reused**. Phase 1 copies `supabase/migrations`
  into the new repo and applies them to the new project.
- **MCP servers must be available in the new repo too** (Supabase, GitHub, Resend, Vercel) —
  Phase 1 verifies this (plan §6a). Without them, every chat silently degrades to manual work.
- Accounts you'll need along the way (all manual — no MCP covers them): **Stripe** test keys +
  webhook (P2.2), **Resend + a sender domain** for email DNS (P2.3), **Apple Developer** $99/yr
  (P9), **Google Play Console** (P9/P10).
- Xcode + Android Studio simulators installed; you'll build an **Expo Dev Client** (not Expo Go —
  Stripe and maps are native modules Expo Go can't run).
- **Node.js LTS installed** (`brew install node`) — verified missing on this machine (2026-07-25):
  bun alone is not enough, the iOS build scripts and EAS tooling call `node` directly. Install the
  **Supabase CLI** too (`brew install supabase/tap/supabase`) — needed from P2.1 (local functions
  harness) and P2.2 (`supabase secrets set`).

---

## Running a phase (every time)

1. Open a **new chat** in the `slotpass-mobile` repo (Phase 1 runs here in the reference repo).
2. Paste the **kickoff prompt** from `REACT_NATIVE_MIGRATION.md` §0b, filling in the phase number.
3. Let it build. All infra work (Supabase project, migrations, Edge Function deploys, GitHub
   repo/branches/PRs, test emails, Vercel deploy) happens **through the MCP tools** — the
   per-phase map is in plan §6a. Manual steps (Stripe dashboard, secrets, DNS) come to you.
4. It must finish by filling **📝 Findings**, running **/code-review**, and updating the
   **Progress Tracker** (§9) and **API Contract** (§7). Note: `/code-review ultra` is billed and
   only YOU can type it — at an ultra gate the chat stops and asks you to run it.
5. Review the code-review output it shows you. If findings were deferred, they're logged with a
   reason. Only then is the phase `✅ Done`.
6. The phase ends with its `phase-<N>` branch pushed and a PR opened; it merges to `main` once
   the gates pass. Next phase = next fresh chat, starting from `main`.

Do phases **in order**, respecting each phase's `Depends on`. The customer app is shippable after
Phase 7; vendor/admin come in Phase 8.

---

## The guardrails (why this won't hallucinate)

The plan's **§0a Definition of Done** is a hard gate. A phase cannot be marked done unless:

- typecheck + lint pass and the app actually boots in the iOS simulator (Android becomes a
  hard gate in Phase 9 — plan §6),
- the phase's **Done when** criteria were really exercised (not "should work"),
- Findings are written down,
- **`/code-review` ran and every finding is fixed or explicitly logged**,
- contract + tracker are updated.

And the standing rule, repeated in the kickoff prompt: **do not invent files, endpoints, prices,
or component names.** Everything is verified against the reference repo or the API contract; if
something is missing, the chat writes that in Findings instead of fabricating it. A phase that
can't pass a gate is marked `⛔ Blocked`, not faked.

Every phase also **appends discoveries to the Working Backlog (§12)** of the plan — any bug, tech
debt, risky assumption, or decision it trips over that's outside its own scope. That's how a fresh
chat inherits what earlier chats learned instead of rediscovering (or re-breaking) it. Genuinely
new features go to §11 (out-of-scope) instead; open decisions to §10.

`/code-review` level per phase:
- **`ultra`** for the risky ones: **Phase 2** (backend/money math), **5** (core flows), **6**
  (payments), **8** (vendor/admin).
- **`high`** for the rest.

---

## Phase map (see the plan for detail)

| # | Phase | Ship milestone |
|---|---|---|
| 1 | New Expo repo + tokens + dev client | app boots themed |
| 2 | Backend rebuild (Edge Functions + contract) | real PaymentIntent works |
| 3 | Mobile core infra (api-client, auth, i18n) | login + data fetch |
| 4 | Design system parity | component library ready |
| 5 | Customer: landing + vendor detail | browse + cart |
| 6 | Customer: checkout + payment | **first real purchase** |
| 7 | Customer: orders + order detail | **customer app shippable** |
| 8 | Vendor + admin + become-vendor | full parity |
| 9 | Native build hardening + EAS | store-ready builds |
| 10 | Launch + decommission web | live on both stores |

---

## If something drifts

- A chat went out of scope or invented things → stop, don't commit, tell the next chat to revert
  and re-read §0a. The plan is the source of truth, not the chat's memory.
- A phase is genuinely blocked → mark it `⛔ Blocked` in §9 with the reason; resolve, then resume.
- Plan itself needs to change → edit `REACT_NATIVE_MIGRATION.md` directly; it's a living document.
