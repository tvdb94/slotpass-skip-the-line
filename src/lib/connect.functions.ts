import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- helpers (kept inline; loaded lazily inside handlers to avoid client-graph leaks) ----------

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function getVendorForCaller(supabase: import("@supabase/supabase-js").SupabaseClient, userId: string, vendorId: string) {
  // Verify the caller is staff of this vendor via RLS-scoped client.
  const { data: staff } = await supabase
    .from("staff")
    .select("id, email, vendor_id")
    .eq("auth_user_id", userId)
    .eq("vendor_id", vendorId)
    .maybeSingle();
  return staff;
}

async function getOrigin(): Promise<string> {
  // Derive from the incoming request so we work on preview + production without extra env config.
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest();
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

// ---------- 1) Create / refresh Express onboarding link ----------

export const createOnboardingLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ vendorId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const staff = await getVendorForCaller(supabase, userId, data.vendorId);
    if (!staff) throw new Error("Not authorized for this vendor");

    const admin = await loadAdmin();
    const { data: vendor, error: vErr } = await admin
      .from("vendors")
      .select("id, name, stripe_account_id")
      .eq("id", data.vendorId)
      .maybeSingle();
    if (vErr || !vendor) throw new Error("Vendor not found");

    const { getStripe } = await import("./stripe.server");
    const stripe = getStripe();

    let accountId = vendor.stripe_account_id as string | null;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "NL",
        email: staff.email ?? undefined,
        business_profile: { name: vendor.name, mcc: "5812" }, // Eating places
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
          // iDEAL is enabled per-account via Stripe dashboard; no separate capability toggle needed.
        },
        metadata: { vendor_id: vendor.id },
      });
      accountId = account.id;
      const { error: uErr } = await admin
        .from("vendors")
        .update({ stripe_account_id: accountId })
        .eq("id", vendor.id);
      if (uErr) throw uErr;
    }

    const origin = await getOrigin();
    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: `${origin}/vendor?connect=return`,
      refresh_url: `${origin}/vendor?connect=refresh`,
    });
    return { url: link.url };
  });

// ---------- 2) Login link to Stripe Express dashboard ----------

export const createLoginLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ vendorId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const staff = await getVendorForCaller(supabase, userId, data.vendorId);
    if (!staff) throw new Error("Not authorized for this vendor");

    const admin = await loadAdmin();
    const { data: vendor } = await admin
      .from("vendors").select("stripe_account_id").eq("id", data.vendorId).maybeSingle();
    if (!vendor?.stripe_account_id) throw new Error("Vendor not connected to Stripe yet");

    const { getStripe } = await import("./stripe.server");
    const link = await getStripe().accounts.createLoginLink(vendor.stripe_account_id);
    return { url: link.url };
  });

// ---------- 3) Refresh onboarding status from Stripe (called on ?connect=return) ----------

export const refreshConnectStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ vendorId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const staff = await getVendorForCaller(supabase, userId, data.vendorId);
    if (!staff) throw new Error("Not authorized for this vendor");

    const admin = await loadAdmin();
    const { data: vendor } = await admin
      .from("vendors").select("stripe_account_id").eq("id", data.vendorId).maybeSingle();
    if (!vendor?.stripe_account_id) return { updated: false };

    const { getStripe } = await import("./stripe.server");
    const account = await getStripe().accounts.retrieve(vendor.stripe_account_id);
    await admin
      .from("vendors")
      .update({
        stripe_charges_enabled: !!account.charges_enabled,
        stripe_payouts_enabled: !!account.payouts_enabled,
        stripe_details_submitted: !!account.details_submitted,
      })
      .eq("id", data.vendorId);

    return {
      updated: true,
      chargesEnabled: !!account.charges_enabled,
      payoutsEnabled: !!account.payouts_enabled,
      detailsSubmitted: !!account.details_submitted,
    };
  });

// ---------- 4) Earnings summary + payout history ----------

export const getVendorEarnings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      vendorId: z.string().uuid(),
      // Inclusive UTC dates as YYYY-MM-DD.
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const staff = await getVendorForCaller(supabase, userId, data.vendorId);
    if (!staff) throw new Error("Not authorized for this vendor");

    const admin = await loadAdmin();
    const { data: vendor } = await admin
      .from("vendors")
      .select("stripe_account_id, service_fee_cents, commission_pct")
      .eq("id", data.vendorId)
      .maybeSingle();

    // Full-day inclusive range in UTC. Callers pass YYYY-MM-DD; we bracket [from 00:00, to+1 00:00).
    const fromIso = `${data.from}T00:00:00.000Z`;
    const toDate = new Date(`${data.to}T00:00:00.000Z`);
    toDate.setUTCDate(toDate.getUTCDate() + 1);
    const toIso = toDate.toISOString();

    const { data: rows } = await admin
      .from("orders")
      .select("id, status, total_cents, service_fee_cents, commission_cents, platform_fee_cents, application_fee_cents, created_at")
      .eq("vendor_id", data.vendorId)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      .in("status", ["paid", "collected", "no_show"]);

    let gross = 0, platformFee = 0, commission = 0, orderCount = 0;
    for (const o of rows ?? []) {
      gross += o.total_cents ?? 0;
      // Prefer webhook-snapshotted platform_fee_cents; fall back to service_fee_cents for demo/simulate orders.
      platformFee += (o.platform_fee_cents ?? 0) || (o.service_fee_cents ?? 0);
      commission += o.commission_cents ?? 0;
      orderCount += 1;
    }
    const totalFees = platformFee + commission;
    const net = gross - totalFees;

    // Payout history from Stripe (only when the vendor has a connected account).
    let payouts: Array<{
      id: string; amount_cents: number; currency: string; status: string;
      arrival_date: number; created: number;
    }> = [];
    if (vendor?.stripe_account_id) {
      try {
        const { getStripe } = await import("./stripe.server");
        const list = await getStripe().payouts.list(
          { limit: 20 },
          { stripeAccount: vendor.stripe_account_id },
        );
        payouts = list.data.map((p) => ({
          id: p.id,
          amount_cents: p.amount,
          currency: p.currency,
          status: p.status,
          arrival_date: p.arrival_date,
          created: p.created,
        }));
      } catch {
        // Vendor may have created an account but not finished onboarding; skip payout history silently.
      }
    }

    return {
      summary: {
        orderCount,
        grossCents: gross,
        platformFeeCents: platformFee,
        commissionCents: commission,
        totalFeesCents: totalFees,
        netToVendorCents: net,
      },
      payouts,
      hasConnectedAccount: !!vendor?.stripe_account_id,
    };
  });