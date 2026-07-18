import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { formatEUR, formatTime } from "@/lib/format";

export const Route = createFileRoute("/vendor")({
  component: VendorDashboard,
});

type Vendor = { id: string; slug: string; name: string; brand_primary: string | null };
type Slot = {
  id: string; date: string; start_time: string; end_time: string;
  capacity: number; orders_count: number; discount_pct: number; is_open: boolean;
};
type OrderRow = {
  id: string; order_code: string; status: string; total_cents: number;
  customer_name: string | null; qr_token: string | null; slot_id: string;
  paid_at: string | null; collected_at: string | null; no_show_at: string | null;
};
type MenuItem = {
  id: string; name_nl: string; name_en: string; price_cents: number; is_available: boolean | null;
};
type AnalyticsRow = {
  status: string; total_cents: number; commission_cents: number; created_at: string; id: string;
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

  // Bootstrap: resolve current user -> staff -> vendor -> data
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) { if (!cancel) { setLoading(false); setNotLinked(true); } return; }
      const { data: staff } = await supabase
        .from("staff")
        .select("vendor_id, vendors(id, slug, name, brand_primary)")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (cancel) return;
      const v = (staff?.vendors ?? null) as Vendor | null;
      if (!v) { setLoading(false); setNotLinked(true); return; }
      setVendor(v);
      await Promise.all([reloadSlots(v.id), reloadOrders(v.id), reloadMenu(v.id), reloadAnalytics(v.id)]);
      if (!cancel) setLoading(false);
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      .select("id,name_nl,name_en,price_cents,is_available")
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
  async function toggleItemAvail(m: MenuItem) {
    await supabase.from("menu_items").update({ is_available: !m.is_available }).eq("id", m.id);
    if (vendor) reloadMenu(vendor.id);
  }
  async function updatePrice(m: MenuItem, priceCents: number) {
    if (Number.isNaN(priceCents) || priceCents < 0) return;
    await supabase.from("menu_items").update({ price_cents: priceCents }).eq("id", m.id);
    if (vendor) reloadMenu(vendor.id);
  }

  const primary = vendor?.brand_primary ?? "#111111";
  const slotById = useMemo(() => new Map(slots.map((s) => [s.id, s])), [slots]);

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