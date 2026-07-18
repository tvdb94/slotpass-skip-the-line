import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { formatEUR, formatTime } from "@/lib/format";

export const Route = createFileRoute("/orders")({
  component: OrdersPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-sm">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-center text-sm">Not found</div>,
});

type OrderRow = {
  id: string;
  order_code: string;
  status: string;
  total_cents: number;
  created_at: string;
  vendor_id: string;
  slot_id: string | null;
};
type OrderItemRow = {
  order_id: string;
  menu_item_id: string | null;
  name: string;
  unit_price_cents: number;
  quantity: number;
};
type VendorRow = { id: string; slug: string; name: string; brand_primary: string | null; logo_url: string | null };
type SlotRow = { id: string; date: string; start_time: string; end_time: string };
type MenuItemRow = { id: string; vendor_id: string; is_available: boolean | null; price_cents: number; image_url: string | null; name_nl: string; name_en: string };

function OrdersPage() {
  const { t, lang } = useI18n();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setEmail(data.user?.email ?? null);
    });
  }, []);

  const q = useQuery({
    enabled: userId !== undefined && (!!userId || !!email),
    queryKey: ["my-orders", userId, email],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("id,order_code,status,total_cents,created_at,vendor_id,slot_id")
        .order("created_at", { ascending: false })
        .limit(50);
      if (userId && email) {
        query = query.or(`customer_user_id.eq.${userId},customer_email.eq.${email}`);
      } else if (userId) {
        query = query.eq("customer_user_id", userId);
      } else if (email) {
        query = query.eq("customer_email", email);
      }
      const { data: orders, error } = await query;
      if (error) throw error;
      const list = (orders ?? []) as OrderRow[];
      if (list.length === 0) return { orders: list, items: [] as OrderItemRow[], vendors: {} as Record<string, VendorRow>, slots: {} as Record<string, SlotRow> };

      const orderIds = list.map((o) => o.id);
      const vendorIds = Array.from(new Set(list.map((o) => o.vendor_id)));
      const slotIds = Array.from(new Set(list.map((o) => o.slot_id).filter((x): x is string => !!x)));

      const [itemsRes, vendorsRes, slotsRes] = await Promise.all([
        supabase.from("order_items").select("order_id,menu_item_id,name,unit_price_cents,quantity").in("order_id", orderIds),
        supabase.from("vendors").select("id,slug,name,brand_primary,logo_url").in("id", vendorIds),
        slotIds.length
          ? supabase.from("slots").select("id,date,start_time,end_time").in("id", slotIds)
          : Promise.resolve({ data: [] as SlotRow[], error: null }),
      ]);
      const vendors: Record<string, VendorRow> = {};
      (vendorsRes.data ?? []).forEach((v: VendorRow) => (vendors[v.id] = v));
      const slots: Record<string, SlotRow> = {};
      ((slotsRes.data ?? []) as SlotRow[]).forEach((s) => (slots[s.id] = s));
      return {
        orders: list,
        items: (itemsRes.data ?? []) as OrderItemRow[],
        vendors,
        slots,
      };
    },
  });

  if (userId === undefined) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-4 pt-6 text-sm text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-4 pt-8 text-center">
          <h1 className="text-xl font-black">{t("myOrders")}</h1>
          <p className="mt-3 text-sm text-muted-foreground">{t("signInToSeeOrders")}</p>
          <Link
            to="/login"
            className="mt-4 inline-block rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background"
          >
            {t("signIn")}
          </Link>
        </div>
      </div>
    );
  }

  const data = q.data;
  const nowMs = Date.now();
  const upcoming = (data?.orders ?? []).filter((o) => {
    const s = o.slot_id ? data!.slots[o.slot_id] : null;
    if (!s) return false;
    if (o.status === "collected" || o.status === "no_show" || o.status === "cancelled") return false;
    return new Date(`${s.date}T${s.end_time}`).getTime() >= nowMs - 15 * 60_000;
  });
  const upcomingIds = new Set(upcoming.map((o) => o.id));
  const past = (data?.orders ?? []).filter((o) => !upcomingIds.has(o.id));

  return (
    <div className="min-h-screen bg-background pb-10">
      <Header />
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <h1 className="text-xl font-black">{t("myOrders")}</h1>

        {q.isLoading && <div className="mt-4 text-sm text-muted-foreground">{t("loading")}</div>}

        {q.data && q.data.orders.length === 0 && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {t("noOrdersHistory")}
          </div>
        )}

        {upcoming.length > 0 && (
          <section className="mt-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("upcomingOrders")}</h2>
            <ul className="mt-2 space-y-2">
              {upcoming.map((o) => (
                <OrderCard key={o.id} o={o} data={data!} lang={lang} t={t} />
              ))}
            </ul>
          </section>
        )}

        {past.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("pastOrders")}</h2>
            <ul className="mt-2 space-y-2">
              {past.map((o) => (
                <OrderCard key={o.id} o={o} data={data!} lang={lang} t={t} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

function statusLabel(status: string, t: (k: any) => string) {
  switch (status) {
    case "pending": return t("statusPending");
    case "paid": return t("statusPaid");
    case "collected": return t("statusCollected");
    case "no_show": return t("statusNoShow");
    case "cancelled": return t("statusCancelled");
    default: return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case "paid": return "bg-emerald-100 text-emerald-800";
    case "collected": return "bg-blue-100 text-blue-800";
    case "no_show": return "bg-red-100 text-red-800";
    case "cancelled": return "bg-neutral-200 text-neutral-700";
    default: return "bg-amber-100 text-amber-800";
  }
}

function OrderCard({
  o, data, lang, t,
}: {
  o: OrderRow;
  data: { items: OrderItemRow[]; vendors: Record<string, VendorRow>; slots: Record<string, SlotRow> };
  lang: "nl" | "en";
  t: (k: any) => string;
}) {
  const navigate = useNavigate();
  const { addItem, clear } = useCart();
  const [reordering, setReordering] = useState(false);
  const [reorderWarn, setReorderWarn] = useState(false);
  const vendor = data.vendors[o.vendor_id];
  const slot = o.slot_id ? data.slots[o.slot_id] : null;
  const items = data.items.filter((i) => i.order_id === o.id);
  const primary = vendor?.brand_primary ?? "#111111";

  const reorder = async () => {
    if (!vendor) return;
    setReordering(true);
    setReorderWarn(false);
    const menuItemIds = items.map((i) => i.menu_item_id).filter((x): x is string => !!x);
    const { data: available } = await supabase
      .from("menu_items")
      .select("id,vendor_id,is_available,price_cents,image_url,name_nl,name_en")
      .in("id", menuItemIds.length ? menuItemIds : ["00000000-0000-0000-0000-000000000000"]);
    const avail = new Map<string, MenuItemRow>();
    (available ?? []).forEach((m: MenuItemRow) => avail.set(m.id, m));

    clear();
    let anyMissing = items.length === 0;
    for (const it of items) {
      const m = it.menu_item_id ? avail.get(it.menu_item_id) : undefined;
      if (!m || !m.is_available || m.vendor_id !== vendor.id) {
        anyMissing = true;
        continue;
      }
      addItem(
        { id: vendor.id, slug: vendor.slug },
        {
          menu_item_id: m.id,
          name: lang === "nl" ? m.name_nl : m.name_en,
          price_cents: m.price_cents,
          image_url: m.image_url,
        },
        it.quantity,
      );
    }
    setReordering(false);
    if (anyMissing) {
      setReorderWarn(true);
      setTimeout(() => navigate({ to: "/$slug", params: { slug: vendor.slug } }), 900);
    } else {
      navigate({ to: "/$slug", params: { slug: vendor.slug } });
    }
  };

  return (
    <li className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start gap-3">
        {vendor?.logo_url && (
          <img src={vendor.logo_url} alt="" className="h-10 w-10 shrink-0 rounded-xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="min-w-0 truncate text-sm font-bold" style={{ color: primary }}>
              {vendor?.name ?? "—"}
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusColor(o.status)}`}>
              {statusLabel(o.status, t)}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {slot ? (
              <>
                {new Intl.DateTimeFormat(lang === "nl" ? "nl-NL" : "en-GB", {
                  weekday: "short", day: "numeric", month: "short", timeZone: "Europe/Amsterdam",
                }).format(new Date(slot.date))}{" "}
                · {formatTime(slot.start_time)}–{formatTime(slot.end_time)}
              </>
            ) : (
              <>{t("orderAt")} {new Intl.DateTimeFormat(lang === "nl" ? "nl-NL" : "en-GB", {
                day: "numeric", month: "short",
              }).format(new Date(o.created_at))}</>
            )}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-black">{formatEUR(o.total_cents)}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-end gap-2">
        {reorderWarn && (
          <span className="mr-auto text-[11px] text-amber-700">{t("itemsUnavailableForReorder")}</span>
        )}
        <Link
          to="/order/$code"
          params={{ code: o.order_code }}
          className="rounded-full border border-border px-3 py-1 text-xs font-semibold"
        >
          {t("viewOrder")}
        </Link>
        <button
          onClick={reorder}
          disabled={reordering || !vendor}
          className="rounded-full px-3 py-1 text-xs font-bold text-white disabled:opacity-60"
          style={{ background: primary }}
        >
          {t("reorder")}
        </button>
      </div>
    </li>
  );
}