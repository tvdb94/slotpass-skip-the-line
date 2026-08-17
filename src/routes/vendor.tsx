import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { formatEUR, formatTime } from "@/lib/format";

export const Route = createFileRoute("/vendor")({
  component: VendorDashboard,
});

type Vendor = {
  id: string;
  slug: string;
  name: string;
  brand_primary: string | null;
  stripe_charges_enabled: boolean;
  dynamic_pricing_enabled: boolean;
};
type Slot = {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  capacity: number;
  orders_count: number;
  discount_pct: number;
  auto_discount_pct: number;
  is_open: boolean;
  priority_capacity: number;
  priority_upcharge_cents: number;
  priority_taken: number;
};
type OrderRow = {
  id: string;
  order_code: string;
  status: string;
  total_cents: number;
  customer_name: string | null;
  qr_token: string | null;
  slot_id: string;
  paid_at: string | null;
  collected_at: string | null;
  no_show_at: string | null;
};
type MenuItem = {
  id: string;
  name_nl: string;
  name_en: string;
  price_cents: number;
  is_available: boolean | null;
  daily_stock: number | null;
  stock_remaining: number | null;
};
type AnalyticsRow = {
  status: string;
  total_cents: number;
  commission_cents: number;
  created_at: string;
  id: string;
};
type TopItem = { name: string; qty: number; revenue_cents: number };

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
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);

  // Bootstrap: resolve current user -> staffed vendor -> data.
  // get_my_vendor() is a SECURITY DEFINER read scoped to is_vendor_staff(id); it
  // returns the caller's full vendor row, bypassing B78's column-GRANT that hides
  // stripe_* / dynamic_pricing_enabled from `authenticated`.
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        if (!cancel) {
          setLoading(false);
          setNotLinked(true);
        }
        return;
      }
      const { data: mine } = await supabase.rpc("get_my_vendor");
      if (cancel) return;
      const v = ((mine ?? [])[0] ?? null) as Vendor | null;
      if (!v) {
        setLoading(false);
        setNotLinked(true);
        return;
      }
      setVendor(v);
      await Promise.all([
        reloadSlots(v.id),
        reloadOrders(v.id),
        reloadMenu(v.id),
        reloadAnalytics(v.id),
      ]);
      if (!cancel) setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  // Realtime: incoming orders for this vendor
  useEffect(() => {
    if (!vendor) return;
    const ch = supabase
      .channel(`vendor-orders-${vendor.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `vendor_id=eq.${vendor.id}` },
        () => {
          reloadOrders(vendor.id);
          reloadSlots(vendor.id);
          reloadAnalytics(vendor.id);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [vendor]);

  async function reloadSlots(vendorId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await supabase
      .from("slots")
      .select("*")
      .eq("vendor_id", vendorId)
      .eq("date", today)
      .order("start_time");
    setSlots((data ?? []) as Slot[]);
  }
  async function reloadOrders(vendorId: string) {
    const today = new Date().toISOString().slice(0, 10);
    // orders whose slot is today — fetch orders then filter by slot map for simplicity
    const { data: slotRows } = await supabase
      .from("slots")
      .select("id")
      .eq("vendor_id", vendorId)
      .eq("date", today);
    const ids = (slotRows ?? []).map((s) => s.id);
    if (ids.length === 0) {
      setOrders([]);
      return;
    }
    const { data } = await supabase
      .from("orders")
      .select(
        "id,order_code,status,total_cents,customer_name,qr_token,slot_id,paid_at,collected_at,no_show_at",
      )
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
    if (ids.length === 0) {
      setTopItems([]);
      return;
    }
    const { data: itemRows } = await supabase
      .from("order_items")
      .select("name,quantity,unit_price_cents,discount_cents,order_id")
      .in("order_id", ids);
    const agg = new Map<string, TopItem>();
    for (const r of (itemRows ?? []) as {
      name: string;
      quantity: number;
      unit_price_cents: number;
      discount_cents: number;
      order_id: string;
    }[]) {
      const cur = agg.get(r.name) ?? { name: r.name, qty: 0, revenue_cents: 0 };
      cur.qty += r.quantity;
      cur.revenue_cents += r.unit_price_cents * r.quantity - r.discount_cents;
      agg.set(r.name, cur);
    }
    setTopItems(
      Array.from(agg.values())
        .sort((a, b) => b.revenue_cents - a.revenue_cents)
        .slice(0, 5),
    );
  }

  async function markCollected(order: OrderRow) {
    await supabase
      .from("orders")
      .update({
        status: "collected",
        collected_at: new Date().toISOString(),
        no_show_at: null,
      })
      .eq("id", order.id);
    if (vendor) reloadOrders(vendor.id);
    setFlash(`✓ ${order.order_code}`);
    setTimeout(() => setFlash(null), 1500);
  }

  async function markNoShow(order: OrderRow) {
    await supabase
      .from("orders")
      .update({
        status: "no_show",
        no_show_at: new Date().toISOString(),
      })
      .eq("id", order.id);
    if (vendor) reloadOrders(vendor.id);
  }

  async function undoNoShow(order: OrderRow) {
    await supabase
      .from("orders")
      .update({
        status: "paid",
        no_show_at: null,
      })
      .eq("id", order.id);
    if (vendor) reloadOrders(vendor.id);
  }

  async function lookupAndCollect() {
    const q = scan.trim();
    if (!q || !vendor) return;
    const cols =
      "id,order_code,status,total_cents,customer_name,qr_token,slot_id,paid_at,collected_at,no_show_at,vendor_id";
    const { data: byToken } = await supabase
      .from("orders")
      .select(cols)
      .eq("qr_token", q)
      .maybeSingle();
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
      await supabase
        .from("menu_items")
        .update({ daily_stock: null, stock_remaining: null, stock_date: null })
        .eq("id", m.id);
    } else {
      const n = Math.max(0, Math.floor(Number(trimmed)));
      if (Number.isNaN(n)) return;
      const today = new Date().toISOString().slice(0, 10);
      await supabase
        .from("menu_items")
        .update({ daily_stock: n, stock_remaining: n, stock_date: today })
        .eq("id", m.id);
    }
    if (vendor) reloadMenu(vendor.id);
  }

  const primary = vendor?.brand_primary ?? "#111111";
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);

  const stats = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let dayRev = 0,
      dayCount = 0;
    let weekRev = 0,
      weekCount = 0;
    let weekCommission = 0;
    let attempted = 0,
      noShows = 0;
    for (const o of analytics) {
      const isCancelled = o.status === "cancelled";
      if (isCancelled) continue;
      const d = (o.created_at ?? "").slice(0, 10);
      const isPaidLike = o.status === "paid" || o.status === "collected" || o.status === "no_show";
      if (isPaidLike) {
        weekRev += o.total_cents;
        weekCommission += o.commission_cents ?? 0;
        weekCount += 1;
        if (d === today) {
          dayRev += o.total_cents;
          dayCount += 1;
        }
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
        <div className="mx-auto max-w-3xl px-4 pt-6 text-sm text-muted-foreground">
          {t("loading")}
        </div>
      </div>
    );
  }

  if (notLinked) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-md px-4 pt-10 text-center">
          <p className="text-sm text-muted-foreground">{t("notStaff")}</p>
          <Link
            to="/login"
            className="mt-4 inline-block rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background"
          >
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
              <div className="text-[11px] font-bold uppercase tracking-widest opacity-80">
                {t("dashboard")}
              </div>
              <div className="text-xl font-black">{vendor?.name}</div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> {t("live")}
            </span>
          </div>
        </div>

        {vendor &&
          orders.length === 0 &&
          !onboardingDismissed &&
          (() => {
            const key = `slotpass:onboarding-dismissed:${vendor.id}`;
            if (typeof window !== "undefined" && localStorage.getItem(key)) return null;
            const brandingDone = Boolean(vendor.brand_primary);
            const slotDone = slots.some((s) => s.is_open);
            const stripeDone = vendor.stripe_charges_enabled;
            const orderDone = false;
            const steps = [
              {
                done: brandingDone,
                label: t("onboardingConfirmBranding"),
                href: `/${vendor.slug}`,
              },
              { done: slotDone, label: t("onboardingAddSlot"), href: null },
              { done: stripeDone, label: t("onboardingConnectStripe"), href: null },
              { done: orderDone, label: t("onboardingFirstOrder"), href: null },
            ];
            const completed = steps.filter((s) => s.done).length;
            return (
              <section className="mt-4 rounded-2xl border border-border bg-card p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {t("onboarding")} · {completed}/{steps.length}
                  </div>
                  <button
                    onClick={() => {
                      localStorage.setItem(key, "1");
                      setOnboardingDismissed(true);
                    }}
                    className="text-[11px] font-semibold text-muted-foreground underline"
                  >
                    {t("onboardingDismiss")}
                  </button>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full transition-all"
                    style={{ width: `${(completed / steps.length) * 100}%`, background: primary }}
                  />
                </div>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {steps.map((s, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${s.done ? "bg-emerald-600 text-white" : "border border-border text-muted-foreground"}`}
                      >
                        {s.done ? "✓" : i + 1}
                      </span>
                      {s.href ? (
                        <a
                          href={s.href}
                          className={
                            s.done
                              ? "line-through text-muted-foreground"
                              : "font-semibold underline"
                          }
                        >
                          {s.label}
                        </a>
                      ) : (
                        <span
                          className={
                            s.done ? "line-through text-muted-foreground" : "font-semibold"
                          }
                        >
                          {s.label}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })()}

        {/* Analytics */}
        <section className="mt-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t("analytics")} · {t("today7d")}
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard
              label={t("revenue")}
              value={`${formatEUR(stats.dayRev)} / ${formatEUR(stats.weekRev)}`}
            />
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
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("topItems")}
              </div>
              <ul className="mt-1 divide-y divide-border text-sm">
                {topItems.map((it) => (
                  <li key={it.name} className="flex items-center justify-between py-1.5">
                    <span className="truncate pr-2">{it.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      ×{it.qty} ·{" "}
                      <span className="font-semibold text-foreground">
                        {formatEUR(it.revenue_cents)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {vendor && <DeepAnalyticsCard vendorId={vendor.id} primary={primary} />}
        </section>

        {/* Scan / lookup */}
        <section className="mt-4 rounded-2xl border border-border bg-card p-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t("scanQr")}
          </h2>
          <div className="mt-2 flex gap-2">
            <input
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              placeholder={t("scanHint")}
              onKeyDown={(e) => {
                if (e.key === "Enter") lookupAndCollect();
              }}
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
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t("todaysOrders")}
          </h2>
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
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-bold">
                          {o.order_code}
                        </span>
                        {s && (
                          <span className="text-xs font-semibold" style={{ color: primary }}>
                            {formatTime(s.start_time)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-sm font-semibold">{o.customer_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatEUR(o.total_cents)}
                      </div>
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
              <div className="mt-4 text-[11px] font-bold uppercase tracking-wider text-amber-700">
                {t("noShow")}
              </div>
              <ul className="mt-1 space-y-1">
                {noShows.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-1.5 text-xs"
                  >
                    <span className="font-mono font-bold">{o.order_code}</span>
                    <span className="text-muted-foreground">{o.customer_name}</span>
                    <div className="flex items-center gap-2">
                      <span>{formatEUR(o.total_cents)}</span>
                      <button
                        onClick={() => undoNoShow(o)}
                        className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-300"
                      >
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
              <div className="mt-4 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                {t("collected")}
              </div>
              <ul className="mt-1 space-y-1">
                {done.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-1.5 text-xs"
                  >
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
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t("slotsMgmt")}
          </h2>
          {slots.length === 0 ? (
            <div className="mt-2 text-sm text-muted-foreground">—</div>
          ) : (
            <ul className="mt-2 space-y-1">
              {slots.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 text-sm"
                >
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
                  <div
                    className="flex items-center gap-1 text-[10px] text-muted-foreground"
                    title="Priority tier (capacity · upcharge €)"
                  >
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
        {vendor && (
          <PricingRulesCard
            vendorId={vendor.id}
            dynamicPricingEnabled={vendor.dynamic_pricing_enabled}
          />
        )}

        {/* Waitlist */}
        {vendor && <WaitlistCard vendorId={vendor.id} />}

        {/* Menu */}
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t("menuMgmt")}
          </h2>
          <ul className="mt-2 space-y-1">
            {items.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">
                    {lang === "nl" ? m.name_nl : m.name_en}
                  </div>
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
                <div
                  className="flex items-center gap-1 text-xs"
                  title="Daily stock (blank = unlimited)"
                >
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
                    <span className="text-[10px] text-muted-foreground">
                      /{m.stock_remaining ?? 0}
                    </span>
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
      <div className="truncate text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-base font-black" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
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

function PricingRulesCard({
  vendorId,
  dynamicPricingEnabled,
}: {
  vendorId: string;
  dynamicPricingEnabled: boolean;
}) {
  const { t } = useI18n();
  const tt = t as unknown as (k: string) => string;
  const [rules, setRules] = useState<PricingRule[]>([]);
  // Initial toggle state comes from the parent's get_my_vendor() row — the
  // `authenticated` role can't SELECT vendors.dynamic_pricing_enabled directly (B78).
  const [enabled, setEnabled] = useState(dynamicPricingEnabled);
  const [triggerMin, setTriggerMin] = useState(120);
  const [maxFill, setMaxFill] = useState(30);
  const [discount, setDiscount] = useState(15);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const { data: rs } = await supabase
      .from("pricing_rules")
      .select("*")
      .eq("vendor_id", vendorId)
      .order("priority", { ascending: false });
    setRules((rs ?? []) as PricingRule[]);
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
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-background p-2 text-xs"
            >
              <span className="flex-1">
                {tt("ifWithin")} {r.trigger_minutes} {tt("minutesShort")} · {tt("fillBelow")}{" "}
                {r.max_fill_pct}% → −{r.discount_pct}%
              </span>
              <button
                onClick={() => toggleActive(r)}
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  r.active ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground"
                }`}
              >
                {r.active ? tt("pricingOn") : tt("pricingOff")}
              </button>
              <button
                onClick={() => removeRule(r)}
                className="text-muted-foreground hover:text-red-600"
                aria-label="delete"
              >
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
      .select(
        "id, slot_id, customer_name, customer_email, party_size, status, offer_expires_at, created_at",
      )
      .eq("vendor_id", vendorId)
      .in("status", ["waiting", "offered"])
      .order("created_at", { ascending: true });
    const list = (data ?? []) as WaitlistRow[];
    setRows(list);
    const ids = Array.from(new Set(list.map((r) => r.slot_id)));
    if (ids.length) {
      const { data: s } = await supabase.from("slots").select("id, date, start_time").in("id", ids);
      const map: Record<string, string> = {};
      for (const row of s ?? [])
        map[row.id] = `${row.date} · ${String(row.start_time).slice(0, 5)}`;
      setSlotLabels(map);
    }
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel(`waitlist-${vendorId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "waitlist_entries",
          filter: `vendor_id=eq.${vendorId}`,
        },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
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
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-xl border border-border bg-background p-2 text-xs"
            >
              <span className="font-mono">{slotLabels[r.slot_id] ?? "…"}</span>
              <span className="min-w-0 flex-1 truncate">
                {r.customer_name ?? r.customer_email} · ×{r.party_size}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  r.status === "offered"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-muted text-muted-foreground"
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
// ============================================================
// Deep analytics: utilization heatmap, peak hours, daypart revenue
// ============================================================
type SlotAgg = { date: string; start_time: string; capacity: number; orders_count: number };
type OrderAgg = { total_cents: number; status: string; slot_id: string };

function DeepAnalyticsCard({ vendorId, primary }: { vendorId: string; primary: string }) {
  const { t } = useI18n();
  const [slots30, setSlots30] = useState<SlotAgg[]>([]);
  const [orders30, setOrders30] = useState<OrderAgg[]>([]);
  const [slotMap, setSlotMap] = useState<Record<string, SlotAgg>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - 29);
      const fromDate = from.toISOString().slice(0, 10);
      const toDate = to.toISOString().slice(0, 10);
      const { data: slotRows } = await supabase
        .from("slots")
        .select("id,date,start_time,capacity,orders_count")
        .eq("vendor_id", vendorId)
        .gte("date", fromDate)
        .lte("date", toDate);
      const sList = (slotRows ?? []) as (SlotAgg & { id: string })[];
      const ids = sList.map((s) => s.id);
      const map: Record<string, SlotAgg> = {};
      for (const s of sList) map[s.id] = s;
      let oList: OrderAgg[] = [];
      if (ids.length) {
        const { data: orderRows } = await supabase
          .from("orders")
          .select("total_cents,status,slot_id")
          .eq("vendor_id", vendorId)
          .in("slot_id", ids)
          .in("status", ["paid", "collected", "no_show"]);
        oList = (orderRows ?? []) as OrderAgg[];
      }
      if (cancel) return;
      setSlots30(sList);
      setSlotMap(map);
      setOrders30(oList);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, [vendorId]);

  const { heatmap, hours, hourly, daypart, hasData } = useMemo(() => {
    // Determine hour range from slot start_times
    const hourSet = new Set<number>();
    for (const s of slots30) hourSet.add(parseInt(s.start_time.slice(0, 2), 10));
    const hoursArr = Array.from(hourSet).sort((a, b) => a - b);
    // heat[dow][hour] = { cap, orders }
    const heat: Record<number, Record<number, { cap: number; ord: number }>> = {};
    for (let d = 0; d < 7; d++) heat[d] = {};
    for (const s of slots30) {
      const dow = new Date(s.date + "T00:00:00").getDay();
      const h = parseInt(s.start_time.slice(0, 2), 10);
      const cell = heat[dow][h] ?? { cap: 0, ord: 0 };
      cell.cap += s.capacity ?? 0;
      cell.ord += s.orders_count ?? 0;
      heat[dow][h] = cell;
    }
    // Peak hours: total orders per hour
    const hourlyMap = new Map<number, number>();
    // Daypart revenue
    const dp = { morning: 0, lunch: 0, afternoon: 0, evening: 0, night: 0 };
    for (const o of orders30) {
      const s = slotMap[o.slot_id];
      if (!s) continue;
      const h = parseInt(s.start_time.slice(0, 2), 10);
      hourlyMap.set(h, (hourlyMap.get(h) ?? 0) + 1);
      if (h >= 5 && h < 11) dp.morning += o.total_cents;
      else if (h >= 11 && h < 14) dp.lunch += o.total_cents;
      else if (h >= 14 && h < 17) dp.afternoon += o.total_cents;
      else if (h >= 17 && h < 21) dp.evening += o.total_cents;
      else dp.night += o.total_cents;
    }
    const hourlyArr = hoursArr.map((h) => ({ h, count: hourlyMap.get(h) ?? 0 }));
    return {
      heatmap: heat,
      hours: hoursArr,
      hourly: hourlyArr,
      daypart: dp,
      hasData: slots30.length > 0,
    };
  }, [slots30, orders30, slotMap]);

  if (loading) {
    return (
      <div className="mt-3 rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground">
        {t("loading")}
      </div>
    );
  }
  if (!hasData) {
    return (
      <div className="mt-3 rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground">
        {t("noAnalytics")}
      </div>
    );
  }

  const dowLabels = [t("dow1"), t("dow2"), t("dow3"), t("dow4"), t("dow5"), t("dow6"), t("dow0")];
  const dowOrder = [1, 2, 3, 4, 5, 6, 0];
  const maxHourly = Math.max(1, ...hourly.map((x) => x.count));
  const dpEntries: Array<{ label: string; cents: number }> = [
    { label: t("dpMorning"), cents: daypart.morning },
    { label: t("dpLunch"), cents: daypart.lunch },
    { label: t("dpAfternoon"), cents: daypart.afternoon },
    { label: t("dpEvening"), cents: daypart.evening },
    { label: t("dpNight"), cents: daypart.night },
  ];
  const dpMax = Math.max(1, ...dpEntries.map((x) => x.cents));

  return (
    <>
      {/* Heatmap */}
      <div className="mt-3 rounded-2xl border border-border bg-card p-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {t("utilizationHeatmap")}
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="text-[10px]">
            <thead>
              <tr>
                <th className="px-1"></th>
                {hours.map((h) => (
                  <th key={h} className="px-1 py-0.5 font-mono text-muted-foreground">
                    {String(h).padStart(2, "0")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dowOrder.map((dow, i) => (
                <tr key={dow}>
                  <td className="pr-1 font-semibold text-muted-foreground">{dowLabels[i]}</td>
                  {hours.map((h) => {
                    const cell = heatmap[dow]?.[h];
                    if (!cell || cell.cap === 0) {
                      return (
                        <td key={h} className="p-0.5">
                          <div className="h-5 w-5 rounded bg-muted/40" />
                        </td>
                      );
                    }
                    const util = Math.min(1, cell.ord / cell.cap);
                    return (
                      <td key={h} className="p-0.5">
                        <div
                          className="h-5 w-5 rounded"
                          title={`${Math.round(util * 100)}% (${cell.ord}/${cell.cap})`}
                          style={{ background: primary, opacity: 0.15 + util * 0.85 }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Peak hours */}
      <div className="mt-3 rounded-2xl border border-border bg-card p-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {t("peakHours")}
        </div>
        <div className="mt-2 flex items-end gap-1 h-24">
          {hourly.map(({ h, count }) => (
            <div key={h} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${(count / maxHourly) * 100}%`,
                    background: primary,
                    minHeight: count > 0 ? 2 : 0,
                  }}
                  title={`${count}`}
                />
              </div>
              <div className="font-mono text-[9px] text-muted-foreground">
                {String(h).padStart(2, "0")}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Daypart revenue */}
      <div className="mt-3 rounded-2xl border border-border bg-card p-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          {t("revenueByDaypart")}
        </div>
        <ul className="mt-2 space-y-1.5 text-xs">
          {dpEntries.map((e) => (
            <li key={e.label} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-muted-foreground">{e.label}</span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-muted">
                <div
                  className="h-full rounded"
                  style={{ width: `${(e.cents / dpMax) * 100}%`, background: primary }}
                />
              </div>
              <span className="w-16 shrink-0 text-right font-semibold tabular-nums">
                {formatEUR(e.cents)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
