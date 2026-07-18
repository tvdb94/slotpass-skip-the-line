import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { formatEUR, formatTime } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import {
  createOnboardingLink,
  createLoginLink,
  refreshConnectStatus,
  getVendorEarnings,
} from "@/lib/connect.functions";

export const Route = createFileRoute("/vendor")({
  component: VendorDashboard,
});

type Vendor = {
  id: string; slug: string; name: string; brand_primary: string | null;
  stripe_account_id: string | null;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_details_submitted: boolean;
};
type Slot = {
  id: string; date: string; start_time: string; end_time: string;
  capacity: number; orders_count: number; discount_pct: number; auto_discount_pct: number; is_open: boolean;
  priority_capacity: number; priority_upcharge_cents: number; priority_taken: number;
};
type OrderRow = {
  id: string; order_code: string; status: string; total_cents: number;
  customer_name: string | null; qr_token: string | null; slot_id: string;
  paid_at: string | null; collected_at: string | null; no_show_at: string | null;
};
type MenuItem = {
  id: string; name_nl: string; name_en: string; price_cents: number; is_available: boolean | null;
  daily_stock: number | null; stock_remaining: number | null;
};
type AnalyticsRow = {
  status: string; total_cents: number; commission_cents: number; created_at: string; id: string;
};
type TopItem = { name: string; qty: number; revenue_cents: number };
type Payout = { id: string; amount_cents: number; currency: string; status: string; arrival_date: number; created: number };
type Earnings = {
  summary: { orderCount: number; grossCents: number; platformFeeCents: number;
    commissionCents: number; totalFeesCents: number; netToVendorCents: number };
  payouts: Payout[];
  hasConnectedAccount: boolean;
};
type RangePreset = "7d" | "30d" | "month" | "custom";

function VendorDashboard() {
  const { t, lang } = useI18n();
  const [loading, setLoading] = useState(true);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [notLinked, setNotLinked] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [scan, setScan] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsRow[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);

  // Stripe Connect UI state
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [rangePreset, setRangePreset] = useState<RangePreset>("7d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const onboardingFn = useServerFn(createOnboardingLink);
  const loginFn = useServerFn(createLoginLink);
  const refreshFn = useServerFn(refreshConnectStatus);
  const earningsFn = useServerFn(getVendorEarnings);

  // Bootstrap: resolve current user -> staff -> vendor -> data
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) { if (!cancel) { setLoading(false); setNotLinked(true); } return; }
      const { data: staff } = await supabase
        .from("staff")
        .select("vendor_id, vendors(id, slug, name, brand_primary, stripe_account_id, stripe_charges_enabled, stripe_payouts_enabled, stripe_details_submitted)")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (cancel) return;
      const v = (staff?.vendors ?? null) as Vendor | null;
      if (!v) { setLoading(false); setNotLinked(true); return; }
      setVendor(v);
      await Promise.all([reloadSlots(v.id), reloadOrders(v.id), reloadMenu(v.id), reloadAnalytics(v.id)]);
      if (!cancel) setLoading(false);

      // If the user just came back from Stripe onboarding, pull fresh status.
      const url = new URL(window.location.href);
      const connect = url.searchParams.get("connect");
      if (connect === "return") {
        try {
          const res = await refreshFn({ data: { vendorId: v.id } });
          setVendor({
            ...v,
            stripe_charges_enabled: !!res.chargesEnabled,
            stripe_payouts_enabled: !!res.payoutsEnabled,
            stripe_details_submitted: !!res.detailsSubmitted,
          });
        } catch { /* ignore */ }
        url.searchParams.delete("connect");
        window.history.replaceState({}, "", url.toString());
      } else if (connect === "refresh") {
        // Onboarding link expired — regenerate a new one immediately.
        try {
          const { url: newUrl } = await onboardingFn({ data: { vendorId: v.id } });
          window.location.href = newUrl;
          return;
        } catch { /* ignore */ }
      }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch earnings whenever range or vendor changes.
  useEffect(() => {
    if (!vendor) return;
    const [from, to] = resolveRange(rangePreset, customFrom, customTo);
    if (!from || !to) return;
    let cancel = false;
    earningsFn({ data: { vendorId: vendor.id, from, to } })
      .then((e) => { if (!cancel) setEarnings(e as Earnings); })
      .catch(() => { if (!cancel) setEarnings(null); });
    return () => { cancel = true; };
  }, [vendor, rangePreset, customFrom, customTo, earningsFn]);

  // Realtime: incoming orders for this vendor
  useEffect(() => {
    if (!vendor) return;
    const ch = supabase
      .channel(`vendor-orders-${vendor.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `vendor_id=eq.${vendor.id}` },
        () => { reloadOrders(vendor.id); reloadSlots(vendor.id); reloadAnalytics(vendor.id); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [vendor]);

  async function reloadSlots(vendorId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("slots").select("*").eq("vendor_id", vendorId).eq("date", today)
      .order("start_time");
    setSlots((data ?? []) as Slot[]);
  }
  async function reloadOrders(vendorId: string) {
    const today = new Date().toISOString().slice(0, 10);
    // orders whose slot is today — fetch orders then filter by slot map for simplicity
    const { data: slotRows } = await supabase
      .from("slots").select("id").eq("vendor_id", vendorId).eq("date", today);
    const ids = (slotRows ?? []).map((s) => s.id);
    if (ids.length === 0) { setOrders([]); return; }
    const { data } = await supabase
      .from("orders")
      .select("id,order_code,status,total_cents,customer_name,qr_token,slot_id,paid_at,collected_at,no_show_at")
      .eq("vendor_id", vendorId)
      .in("slot_id", ids)
      .order("paid_at", { ascending: false });
    setOrders((data ?? []) as OrderRow[]);
  }
  async function reloadMenu(vendorId: string) {
    const { data } = await supabase
      .from("menu_items")
      .select("id,name_nl,name_en,price_cents,is_available,daily_stock,stock_remaining")
      .eq("vendor_id", vendorId)
      .order("sort_order");
    setItems((data ?? []) as MenuItem[]);
  }
  async function reloadAnalytics(vendorId: string) {
    const from = new Date();
    from.setDate(from.getDate() - 6);
    const fromIso = new Date(from.getFullYear(), from.getMonth(), from.getDate()).toISOString();
    const { data: orderRows } = await supabase
      .from("orders")
      .select("id,status,total_cents,commission_cents,created_at")
      .eq("vendor_id", vendorId)
      .gte("created_at", fromIso);
    const rows = (orderRows ?? []) as AnalyticsRow[];
    setAnalytics(rows);
    const ids = rows.map((o) => o.id);
    if (ids.length === 0) { setTopItems([]); return; }
    const { data: itemRows } = await supabase
      .from("order_items")
      .select("name,quantity,unit_price_cents,discount_cents,order_id")
      .in("order_id", ids);
    const agg = new Map<string, TopItem>();
    for (const r of (itemRows ?? []) as { name: string; quantity: number; unit_price_cents: number; discount_cents: number; order_id: string }[]) {
      const cur = agg.get(r.name) ?? { name: r.name, qty: 0, revenue_cents: 0 };
      cur.qty += r.quantity;
      cur.revenue_cents += r.unit_price_cents * r.quantity - r.discount_cents;
      agg.set(r.name, cur);
    }
    setTopItems(Array.from(agg.values()).sort((a, b) => b.revenue_cents - a.revenue_cents).slice(0, 5));
  }

  async function markCollected(order: OrderRow) {
    await supabase.from("orders").update({
      status: "collected", collected_at: new Date().toISOString(), no_show_at: null,
    }).eq("id", order.id);
    if (vendor) reloadOrders(vendor.id);
    setFlash(`✓ ${order.order_code}`);
    setTimeout(() => setFlash(null), 1500);
  }

  async function markNoShow(order: OrderRow) {
    await supabase.from("orders").update({
      status: "no_show", no_show_at: new Date().toISOString(),
    }).eq("id", order.id);
    if (vendor) reloadOrders(vendor.id);
  }

  async function undoNoShow(order: OrderRow) {
    await supabase.from("orders").update({
      status: "paid", no_show_at: null,
    }).eq("id", order.id);
    if (vendor) reloadOrders(vendor.id);
  }

  async function lookupAndCollect() {
    const q = scan.trim();
    if (!q || !vendor) return;
    const cols = "id,order_code,status,total_cents,customer_name,qr_token,slot_id,paid_at,collected_at,no_show_at,vendor_id";
    const { data: byToken } = await supabase.from("orders").select(cols).eq("qr_token", q).maybeSingle();
    const { data: byCode } = byToken
      ? { data: byToken }
      : await supabase.from("orders").select(cols).eq("order_code", q.toUpperCase()).maybeSingle();
    const found = (byToken ?? byCode) as (OrderRow & { vendor_id: string }) | null;
    if (!found || found.vendor_id !== vendor.id) {
      setFlash(t("orderNotFound"));
      setTimeout(() => setFlash(null), 1800);
      return;
    }
    setScan("");
    await markCollected(found);
  }

  async function toggleSlotOpen(s: Slot) {
    await supabase.from("slots").update({ is_open: !s.is_open }).eq("id", s.id);
    if (vendor) reloadSlots(vendor.id);
  }
  async function updateCapacity(s: Slot, capacity: number) {
    if (Number.isNaN(capacity) || capacity < 0) return;
    await supabase.from("slots").update({ capacity }).eq("id", s.id);
    if (vendor) reloadSlots(vendor.id);
  }
  async function updatePriorityCap(s: Slot, cap: number) {
    if (Number.isNaN(cap) || cap < 0) return;
    await supabase.from("slots").update({ priority_capacity: cap }).eq("id", s.id);
    if (vendor) reloadSlots(vendor.id);
  }
  async function updatePriorityUpcharge(s: Slot, euros: number) {
    if (Number.isNaN(euros) || euros < 0) return;
    await supabase
      .from("slots")
      .update({ priority_upcharge_cents: Math.round(euros * 100) })
      .eq("id", s.id);
    if (vendor) reloadSlots(vendor.id);
  }
  async function toggleItemAvail(m: MenuItem) {
    await supabase.from("menu_items").update({ is_available: !m.is_available }).eq("id", m.id);
    if (vendor) reloadMenu(vendor.id);
  }
  async function updatePrice(m: MenuItem, priceCents: number) {
    if (Number.isNaN(priceCents) || priceCents < 0) return;
    await supabase.from("menu_items").update({ price_cents: priceCents }).eq("id", m.id);
    if (vendor) reloadMenu(vendor.id);
  }
  async function updateDailyStock(m: MenuItem, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") {
      await supabase.from("menu_items")
        .update({ daily_stock: null, stock_remaining: null, stock_date: null })
        .eq("id", m.id);
    } else {
      const n = Math.max(0, Math.floor(Number(trimmed)));
      if (Number.isNaN(n)) return;
      const today = new Date().toISOString().slice(0, 10);
      await supabase.from("menu_items")
        .update({ daily_stock: n, stock_remaining: n, stock_date: today })
        .eq("id", m.id);
    }
    if (vendor) reloadMenu(vendor.id);
  }

  const primary = vendor?.brand_primary ?? "#111111";
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);

  async function connectStripe() {
    if (!vendor) return;
    setConnectBusy(true); setConnectError(null);
    try {
      const { url } = await onboardingFn({ data: { vendorId: vendor.id } });
      window.location.href = url;
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
      setConnectBusy(false);
    }
  }
  async function openStripeDashboard() {
    if (!vendor) return;
    setConnectBusy(true); setConnectError(null);
    try {
      const { url } = await loginFn({ data: { vendorId: vendor.id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnectBusy(false);
    }
  }

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let dayRev = 0, dayCount = 0;
    let weekRev = 0, weekCount = 0;
    let weekCommission = 0;
    let attempted = 0, noShows = 0;
    for (const o of analytics) {
      const isCancelled = o.status === "cancelled";
      if (isCancelled) continue;
      const d = (o.created_at ?? "").slice(0, 10);
      const isPaidLike = o.status === "paid" || o.status === "collected" || o.status === "no_show";
      if (isPaidLike) {
        weekRev += o.total_cents;
        weekCommission += o.commission_cents ?? 0;
        weekCount += 1;
        if (d === today) { dayRev += o.total_cents; dayCount += 1; }
        attempted += 1;
        if (o.status === "no_show") noShows += 1;
      }
    }
    const payout = weekRev - weekCommission;
    const noShowRate = attempted > 0 ? Math.round((noShows / attempted) * 100) : 0;
    return { dayRev, dayCount, weekRev, weekCount, weekCommission, payout, noShowRate };
  }, [analytics]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-4 pt-6 text-sm text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  if (notLinked) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-md px-4 pt-10 text-center">
          <p className="text-sm text-muted-foreground">{t("notStaff")}</p>
          <Link to="/login" className="mt-4 inline-block rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">
            {t("signInAsVendor")}
          </Link>
        </div>
      </div>
    );
  }

  const active = orders.filter((o) => o.status !== "collected" && o.status !== "no_show");
  const done = orders.filter((o) => o.status === "collected");
  const noShows = orders.filter((o) => o.status === "no_show");

  return (
    <div className="min-h-screen bg-background pb-10">
      <Header />
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <div className="rounded-2xl p-4 text-white shadow-md" style={{ background: primary }}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-widest opacity-80">{t("dashboard")}</div>
              <div className="text-xl font-black">{vendor?.name}</div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> {t("live")}
            </span>
          </div>
        </div>

        {/* Stripe Connect status */}
        {vendor && (
          <section className="mt-4 rounded-2xl border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("payouts")}</div>
                <div className="mt-1 text-sm font-semibold">
                  {vendor.stripe_charges_enabled
                    ? t("stripeConnected")
                    : vendor.stripe_account_id
                      ? t("stripeReview")
                      : "Stripe"}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t("stripeConnectHint")}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                {!vendor.stripe_account_id && (
                  <button
                    onClick={connectStripe}
                    disabled={connectBusy}
                    className="rounded-full px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    style={{ background: primary }}
                  >
                    {t("connectStripe")}
                  </button>
                )}
                {vendor.stripe_account_id && !vendor.stripe_charges_enabled && (
                  <button
                    onClick={connectStripe}
                    disabled={connectBusy}
                    className="rounded-full px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                    style={{ background: primary }}
                  >
                    {t("continueOnboarding")}
                  </button>
                )}
                {vendor.stripe_account_id && (
                  <button
                    onClick={openStripeDashboard}
                    disabled={connectBusy}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                  >
                    {t("openStripeDashboard")}
                  </button>
                )}
              </div>
            </div>
            {connectError && <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{connectError}</div>}
          </section>
        )}

        {/* Earnings */}
        <section className="mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("earnings")}</h2>
            <div className="flex gap-1">
              {(["7d", "30d", "month", "custom"] as RangePreset[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setRangePreset(k)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    rangePreset === k ? "text-white" : "border border-border bg-card text-muted-foreground"
                  }`}
                  style={rangePreset === k ? { background: primary } : undefined}
                >
                  {k === "7d" ? t("last7Days") : k === "30d" ? t("last30Days") : k === "month" ? t("thisMonth") : t("custom")}
                </button>
              ))}
            </div>
          </div>
          {rangePreset === "custom" && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">{t("from")}</span>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-1" />
              </label>
              <label className="flex items-center gap-1">
                <span className="text-muted-foreground">{t("to")}</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded border border-border bg-background px-2 py-1" />
              </label>
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label={t("grossSales")} value={formatEUR(earnings?.summary.grossCents ?? 0)} />
            <StatCard label={t("commission")} value={formatEUR(earnings?.summary.commissionCents ?? 0)} />
            <StatCard label={t("slotpassFees")} value={formatEUR(earnings?.summary.totalFeesCents ?? 0)} />
            <StatCard label={t("netToVendor")} value={formatEUR(earnings?.summary.netToVendorCents ?? 0)} accent={primary} />
          </div>

          <div className="mt-3 rounded-2xl border border-border bg-card p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("payoutHistory")}</div>
            {!earnings?.hasConnectedAccount ? (
              <div className="mt-2 text-xs text-muted-foreground">{t("stripeConnectHint")}</div>
            ) : earnings.payouts.length === 0 ? (
              <div className="mt-2 text-xs text-muted-foreground">{t("noPayouts")}</div>
            ) : (
              <ul className="mt-1 divide-y divide-border text-sm">
                {earnings.payouts.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="min-w-0">
                      <div className="font-semibold">{formatEUR(p.amount_cents)}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {new Date(p.arrival_date * 1000).toLocaleDateString(lang === "nl" ? "nl-NL" : "en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${payoutBadge(p.status)}`}>
                      {payoutLabel(p.status, t)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Analytics */}
        <section className="mt-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("analytics")} · {t("today7d")}</h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard label={t("revenue")} value={`${formatEUR(stats.dayRev)} / ${formatEUR(stats.weekRev)}`} />
            <StatCard label={t("ordersCount")} value={`${stats.dayCount} / ${stats.weekCount}`} />
            <StatCard label={t("noShowRate")} value={`${stats.noShowRate}%`} />
            <StatCard
              label={`${t("payout")} · ${t("commission")} ${formatEUR(stats.weekCommission)}`}
              value={formatEUR(stats.payout)}
              accent={primary}
            />
          </div>
          {topItems.length > 0 && (
            <div className="mt-3 rounded-2xl border border-border bg-card p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("topItems")}</div>
              <ul className="mt-1 divide-y divide-border text-sm">
                {topItems.map((it) => (
                  <li key={it.name} className="flex items-center justify-between py-1.5">
                    <span className="truncate pr-2">{it.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      ×{it.qty} · <span className="font-semibold text-foreground">{formatEUR(it.revenue_cents)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Scan / lookup */}
        <section className="mt-4 rounded-2xl border border-border bg-card p-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("scanQr")}</h2>
          <div className="mt-2 flex gap-2">
            <input
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder={t("scanHint")}
              onKeyDown={(e) => { if (e.key === "Enter") lookupAndCollect(); }}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
            <button
              onClick={lookupAndCollect}
              className="rounded-xl px-3 py-2 text-sm font-bold text-white"
              style={{ background: primary }}
            >
              {t("lookup")}
            </button>
          </div>
          {flash && <div className="mt-2 text-xs font-semibold text-muted-foreground">{flash}</div>}
        </section>

        {/* Orders */}
        <section className="mt-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("todaysOrders")}</h2>
          {active.length === 0 && done.length === 0 && (
            <div className="mt-2 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("noOrdersYet")}
            </div>
          )}
          {active.length > 0 && (
            <ul className="mt-2 space-y-2">
              {active.map((o) => {
                const s = slotById.get(o.slot_id);
                return (
                  <li key={o.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-bold">{o.order_code}</span>
                        {s && <span className="text-xs font-semibold" style={{ color: primary }}>{formatTime(s.start_time)}</span>}
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold">{o.customer_name}</div>
                      <div className="text-xs text-muted-foreground">{formatEUR(o.total_cents)}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <button
                        onClick={() => markCollected(o)}
                        className="rounded-full px-3 py-1.5 text-xs font-bold text-white"
                        style={{ background: primary }}
                      >
                        {t("markCollected")}
                      </button>
                      <button
                        onClick={() => markNoShow(o)}
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground"
                      >
                        {t("markNoShow")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {noShows.length > 0 && (
            <>
              <div className="mt-4 text-[11px] font-bold uppercase tracking-wider text-amber-700">{t("noShow")}</div>
              <ul className="mt-1 space-y-1">
                {noShows.map((o) => (
                  <li key={o.id} className="flex items-center justify-between rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-1.5 text-xs">
                    <span className="font-mono font-bold">{o.order_code}</span>
                    <span className="text-muted-foreground">{o.customer_name}</span>
                    <div className="flex items-center gap-2">
                      <span>{formatEUR(o.total_cents)}</span>
                      <button onClick={() => undoNoShow(o)} className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-300">
                        {t("undo")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
          {done.length > 0 && (
            <>
              <div className="mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{t("collected")}</div>
              <ul className="mt-1 space-y-1">
                {done.map((o) => (
                  <li key={o.id} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-1.5 text-xs">
                    <span className="font-mono font-bold">{o.order_code}</span>
                    <span className="text-muted-foreground">{o.customer_name}</span>
                    <span>{formatEUR(o.total_cents)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* Slots */}
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("slotsMgmt")}</h2>
          {slots.length === 0 ? (
            <div className="mt-2 text-sm text-muted-foreground">—</div>
          ) : (
            <ul className="mt-2 space-y-1">
              {slots.map((s) => (
                <li key={s.id} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 text-sm">
                  <div className="w-16 font-mono font-bold">{formatTime(s.start_time)}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{s.orders_count}/</span>
                    <input
                      type="number"
                      defaultValue={s.capacity}
                      onBlur={(e) => updateCapacity(s, Number(e.target.value))}
                      className="w-14 rounded border border-border bg-background px-1 py-0.5 text-xs"
                      min={0}
                    />
                  </div>
                  {s.discount_pct > 0 && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                      −{s.discount_pct}%
                    </span>
                  )}
                  {Number(s.auto_discount_pct ?? 0) > 0 && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold text-sky-700">
                      auto −{Math.round(Number(s.auto_discount_pct))}%
                    </span>
                  )}
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground" title="Priority tier (capacity · upcharge €)">
                    <span>⚡</span>
                    <span>{s.priority_taken}/</span>
                    <input
                      type="number"
                      defaultValue={s.priority_capacity}
                      onBlur={(e) => updatePriorityCap(s, Number(e.target.value))}
                      className="w-10 rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                      min={0}
                    />
                    <span>€</span>
                    <input
                      type="number"
                      step="0.10"
                      defaultValue={(s.priority_upcharge_cents / 100).toFixed(2)}
                      onBlur={(e) => updatePriorityUpcharge(s, Number(e.target.value))}
                      className="w-12 rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                      min={0}
                    />
                  </div>
                  <button
                    onClick={() => toggleSlotOpen(s)}
                    className={`ml-auto rounded-full px-3 py-1 text-[11px] font-bold ${
                      s.is_open ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s.is_open ? t("open") : t("closed")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Dynamic Pricing Rules */}
        {vendor && <PricingRulesCard vendorId={vendor.id} />}

        {/* Waitlist */}
        {vendor && <WaitlistCard vendorId={vendor.id} />}

        {/* Menu */}
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("menuMgmt")}</h2>
          <ul className="mt-2 space-y-1">
            {items.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{lang === "nl" ? m.name_nl : m.name_en}</div>
                </div>
                <div className="flex items-center gap-1 text-xs">
                  €
                  <input
                    type="number"
                    step="0.10"
                    defaultValue={(m.price_cents / 100).toFixed(2)}
                    onBlur={(e) => updatePrice(m, Math.round(Number(e.target.value) * 100))}
                    className="w-16 rounded border border-border bg-background px-1 py-0.5 text-xs"
                    min={0}
                  />
                </div>
                <div className="flex items-center gap-1 text-xs" title="Daily stock (blank = unlimited)">
                  <span className="text-muted-foreground">📦</span>
                  <input
                    type="number"
                    placeholder="∞"
                    defaultValue={m.daily_stock ?? ""}
                    onBlur={(e) => updateDailyStock(m, e.target.value)}
                    className="w-14 rounded border border-border bg-background px-1 py-0.5 text-xs"
                    min={0}
                  />
                  {m.daily_stock != null && (
                    <span className="text-[10px] text-muted-foreground">/{m.stock_remaining ?? 0}</span>
                  )}
                </div>
                <button
                  onClick={() => toggleItemAvail(m)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold ${
                    m.is_available ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {m.is_available ? t("available") : t("unavailableItem")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-black" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}

function resolveRange(preset: RangePreset, customFrom: string, customTo: string): [string, string] {
  if (preset === "custom") {
    return [customFrom, customTo];
  }
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const from = new Date(today);
  if (preset === "7d") from.setDate(today.getDate() - 6);
  else if (preset === "30d") from.setDate(today.getDate() - 29);
  else if (preset === "month") from.setDate(1);
  return [from.toISOString().slice(0, 10), to];
}

function payoutBadge(status: string): string {
  switch (status) {
    case "paid": return "bg-emerald-100 text-emerald-700";
    case "in_transit": return "bg-sky-100 text-sky-700";
    case "pending": return "bg-amber-100 text-amber-700";
    case "failed": return "bg-red-100 text-red-700";
    case "canceled": return "bg-muted text-muted-foreground";
    default: return "bg-muted text-muted-foreground";
  }
}

function payoutLabel(status: string, t: (k: never) => string): string {
  // `t` is the tagged translator; cast keys because Key is a strict union.
  const tt = t as unknown as (k: string) => string;
  switch (status) {
    case "paid": return tt("paidOut");
    case "in_transit": return tt("inTransitPayout");
    case "pending": return tt("pendingPayout");
    case "failed": return tt("failedPayout");
    case "canceled": return tt("canceledPayout");
    default: return status;
  }
}

type PricingRule = {
  id: string;
  vendor_id: string;
  trigger_minutes: number;
  max_fill_pct: number;
  discount_pct: number;
  priority: number;
  active: boolean;
};

function PricingRulesCard({ vendorId }: { vendorId: string }) {
  const { t } = useI18n();
  const tt = t as unknown as (k: string) => string;
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [triggerMin, setTriggerMin] = useState(120);
  const [maxFill, setMaxFill] = useState(30);
  const [discount, setDiscount] = useState(15);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const [{ data: rs }, { data: v }] = await Promise.all([
      supabase.from("pricing_rules").select("*").eq("vendor_id", vendorId).order("priority", { ascending: false }),
      supabase.from("vendors").select("dynamic_pricing_enabled").eq("id", vendorId).maybeSingle(),
    ]);
    setRules((rs ?? []) as PricingRule[]);
    setEnabled(Boolean((v as { dynamic_pricing_enabled?: boolean } | null)?.dynamic_pricing_enabled));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  async function toggleEnabled() {
    setBusy(true);
    const next = !enabled;
    await supabase.from("vendors").update({ dynamic_pricing_enabled: next }).eq("id", vendorId);
    setEnabled(next);
    setBusy(false);
  }

  async function addRule() {
    if (discount < 1 || discount > 90) return;
    setBusy(true);
    await supabase.from("pricing_rules").insert({
      vendor_id: vendorId,
      trigger_minutes: triggerMin,
      max_fill_pct: maxFill,
      discount_pct: discount,
      priority: rules.length,
      active: true,
    });
    await reload();
    setBusy(false);
  }

  async function toggleActive(r: PricingRule) {
    await supabase.from("pricing_rules").update({ active: !r.active }).eq("id", r.id);
    await reload();
  }

  async function removeRule(r: PricingRule) {
    await supabase.from("pricing_rules").delete().eq("id", r.id);
    await reload();
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {tt("dynamicPricing")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">{tt("dynamicPricingHint")}</p>
        </div>
        <button
          onClick={toggleEnabled}
          disabled={busy}
          className={`rounded-full px-3 py-1 text-[11px] font-bold ${
            enabled ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
          }`}
        >
          {enabled ? tt("pricingOn") : tt("pricingOff")}
        </button>
      </div>

      {/* Add rule */}
      <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
        <label className="flex flex-col">
          <span className="mb-0.5 font-semibold text-muted-foreground">{tt("ifWithin")}</span>
          <select
            value={triggerMin}
            onChange={(e) => setTriggerMin(Number(e.target.value))}
            className="rounded border border-border bg-background px-1 py-1"
          >
            <option value={60}>60 min</option>
            <option value={120}>120 min</option>
            <option value={180}>180 min</option>
            <option value={240}>240 min</option>
          </select>
        </label>
        <label className="flex flex-col">
          <span className="mb-0.5 font-semibold text-muted-foreground">{tt("fillBelow")}</span>
          <input
            type="number"
            value={maxFill}
            onChange={(e) => setMaxFill(Math.max(1, Math.min(100, Number(e.target.value))))}
            className="rounded border border-border bg-background px-1 py-1"
            min={1}
            max={100}
          />
        </label>
        <label className="flex flex-col">
          <span className="mb-0.5 font-semibold text-muted-foreground">{tt("discountPct")}</span>
          <input
            type="number"
            value={discount}
            onChange={(e) => setDiscount(Math.max(1, Math.min(90, Number(e.target.value))))}
            className="rounded border border-border bg-background px-1 py-1"
            min={1}
            max={90}
          />
        </label>
        <button
          onClick={addRule}
          disabled={busy}
          className="self-end rounded-full bg-foreground px-3 py-1.5 text-[11px] font-bold text-background"
        >
          {tt("addRule")}
        </button>
      </div>

      {/* Rules list */}
      <ul className="mt-3 space-y-1">
        {rules.length === 0 ? (
          <li className="text-xs text-muted-foreground">{tt("noRules")}</li>
        ) : (
          rules.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl border border-border bg-background p-2 text-xs">
              <span className="flex-1">
                {tt("ifWithin")} {r.trigger_minutes} {tt("minutesShort")} · {tt("fillBelow")} {r.max_fill_pct}% → −{r.discount_pct}%
              </span>
              <button
                onClick={() => toggleActive(r)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  r.active ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {r.active ? tt("pricingOn") : tt("pricingOff")}
              </button>
              <button onClick={() => removeRule(r)} className="text-muted-foreground hover:text-red-600" aria-label="delete">
                ×
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}

type WaitlistRow = {
  id: string;
  slot_id: string;
  customer_name: string | null;
  customer_email: string;
  party_size: number;
  status: string;
  offer_expires_at: string | null;
  created_at: string;
};

function WaitlistCard({ vendorId }: { vendorId: string }) {
  const { lang } = useI18n();
  const [rows, setRows] = useState<WaitlistRow[]>([]);
  const [slotLabels, setSlotLabels] = useState<Record<string, string>>({});

  async function load() {
    const { data } = await supabase
      .from("waitlist_entries")
      .select("id, slot_id, customer_name, customer_email, party_size, status, offer_expires_at, created_at")
      .eq("vendor_id", vendorId)
      .in("status", ["waiting", "offered"])
      .order("created_at", { ascending: true });
    const list = (data ?? []) as WaitlistRow[];
    setRows(list);
    const ids = Array.from(new Set(list.map((r) => r.slot_id)));
    if (ids.length) {
      const { data: s } = await supabase
        .from("slots")
        .select("id, date, start_time")
        .in("id", ids);
      const map: Record<string, string> = {};
      for (const row of s ?? []) map[row.id] = `${row.date} · ${String(row.start_time).slice(0, 5)}`;
      setSlotLabels(map);
    }
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`waitlist-${vendorId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "waitlist_entries", filter: `vendor_id=eq.${vendorId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [vendorId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function cancelEntry(id: string) {
    await supabase.from("waitlist_entries").update({ status: "cancelled" }).eq("id", id);
    load();
  }

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-3">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {lang === "nl" ? "Wachtlijst" : "Waitlist"}
      </h2>
      {rows.length === 0 ? (
        <div className="mt-2 text-xs text-muted-foreground">
          {lang === "nl" ? "Geen wachtenden." : "No one waiting."}
        </div>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl border border-border bg-background p-2 text-xs">
              <span className="font-mono">{slotLabels[r.slot_id] ?? "…"}</span>
              <span className="min-w-0 flex-1 truncate">
                {r.customer_name ?? r.customer_email} · ×{r.party_size}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  r.status === "offered" ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                }`}
              >
                {r.status}
              </span>
              <button
                onClick={() => cancelEntry(r.id)}
                className="text-muted-foreground hover:text-red-600"
                aria-label="cancel"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}