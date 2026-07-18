import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { formatEUR, formatTime } from "@/lib/format";
import { StarRating } from "@/components/StarRating";

export const Route = createFileRoute("/order/$code")({
  component: OrderPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-sm">{error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8 text-center text-sm">Order not found</div>,
});

type Order = {
  id: string; order_code: string; qr_token: string; status: string; collected_at: string | null;
  subtotal_cents: number; discount_cents: number; service_fee_cents: number; total_cents: number;
  customer_name: string; customer_email: string; slot_id: string; vendor_id: string;
};
type OrderItem = { id: string; name: string; unit_price_cents: number; discount_cents: number; quantity: number };
type Vendor = { name: string; slug: string; brand_primary: string | null; address: string | null; logo_url: string | null };
type Slot = { date: string; start_time: string; end_time: string };

function OrderPage() {
  const { code } = Route.useParams();
  const { t, lang } = useI18n();

  const q = useQuery({
    queryKey: ["order", code],
    queryFn: async () => {
      // Uses a security-definer RPC so anon can read a single order by its unguessable code
      // without opening up SELECT on orders to the public.
      const { data: rows, error } = await supabase.rpc("get_order_by_code", { _code: code });
      if (error) throw error;
      const order = Array.isArray(rows) ? rows[0] : null;
      if (!order) throw new Error("Order not found");
      const [items, vendor, slot] = await Promise.all([
        supabase.rpc("get_order_items_by_code", { _code: code }),
        supabase.from("vendors").select("name,slug,brand_primary,address,logo_url").eq("id", order.vendor_id).maybeSingle(),
        supabase.from("slots").select("date,start_time,end_time").eq("id", order.slot_id).maybeSingle(),
      ]);
      return {
        order: order as Order,
        items: (items.data ?? []) as OrderItem[],
        vendor: vendor.data as Vendor | null,
        slot: slot.data as Slot | null,
      };
    },
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-4 pt-6 text-sm text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  const { order, items, vendor, slot } = q.data;
  const primary = vendor?.brand_primary ?? "#111111";

  return (
    <div className="min-h-screen bg-background pb-10">
      <Header />
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <div className="rounded-2xl p-5 text-white shadow-lg" style={{ background: primary }}>
          <div className="text-[11px] font-bold uppercase tracking-widest opacity-80">
            {t("orderConfirmed")}
          </div>
          <div className="mt-1 text-2xl font-black">{vendor?.name}</div>
          {slot && (
            <div className="mt-1 text-sm font-semibold opacity-95">
              {new Intl.DateTimeFormat(lang === "nl" ? "nl-NL" : "en-GB", {
                weekday: "long",
                day: "numeric",
                month: "short",
                timeZone: "Europe/Amsterdam",
              }).format(new Date(slot.date))}{" "}
              · {formatTime(slot.start_time)}–{formatTime(slot.end_time)}
            </div>
          )}
          <div className="mt-1 text-xs opacity-80">{vendor?.address}</div>
        </div>

        {/* QR */}
        <div className="mt-4 flex flex-col items-center rounded-2xl border border-border bg-card p-5">
          <div className="rounded-xl bg-white p-3">
            <QRCodeSVG value={order.qr_token} size={200} level="M" />
          </div>
          <div className="mt-3 text-xs font-semibold text-muted-foreground">{t("showAtPickup")}</div>
          <div className="mt-2 text-xs text-muted-foreground">
            {t("orderCode")}:{" "}
            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-sm font-bold text-foreground">
              {order.order_code}
            </span>
          </div>
        </div>

        {/* Items */}
        <div className="mt-4 rounded-2xl border border-border bg-card p-3 text-sm">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("yourOrder")}</h2>
          <ul className="mt-2 divide-y divide-border">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="font-semibold">{i.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.quantity} × {formatEUR(i.unit_price_cents)}
                  </div>
                </div>
                <div className="font-bold">{formatEUR(i.unit_price_cents * i.quantity - i.discount_cents)}</div>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs">
            <span className="text-muted-foreground">{t("subtotal")}</span>
            <span>{formatEUR(order.subtotal_cents)}</span>
          </div>
          {order.discount_cents > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("offPeak")}</span>
              <span>− {formatEUR(order.discount_cents)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{t("serviceFee")}</span>
            <span>{formatEUR(order.service_fee_cents)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between font-black">
            <span>{t("total")}</span>
            <span style={{ color: primary }}>{formatEUR(order.total_cents)}</span>
          </div>
        </div>

        <Link
          to="/"
          className="mt-6 block rounded-full border border-border bg-background py-3 text-center text-sm font-semibold"
        >
          {t("backToHome")}
        </Link>

        {order.status === "collected" && (
          <ReviewSection orderId={order.id} vendorId={order.vendor_id} primary={primary} />
        )}
      </div>
    </div>
  );
}

function ReviewSection({ orderId, vendorId, primary }: { orderId: string; vendorId: string; primary: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  const existing = useQuery({
    queryKey: ["review", orderId],
    queryFn: async () => {
      const { data } = await supabase.from("reviews").select("*").eq("order_id", orderId).maybeSingle();
      return data;
    },
  });

  if (existing.data) {
    return (
      <div className="mt-6 rounded-2xl border border-border bg-card p-4">
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("yourRating")}</div>
        <div className="mt-2"><StarRating value={existing.data.rating} readOnly /></div>
        {existing.data.comment && (
          <p className="mt-2 text-sm text-muted-foreground">{existing.data.comment}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">{t("thanksReview")}</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="mt-6 rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
        <Link to="/login" className="font-semibold underline" style={{ color: primary }}>
          {t("signInToReview")}
        </Link>
      </div>
    );
  }

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.from("reviews").insert({
      vendor_id: vendorId,
      order_id: orderId,
      customer_user_id: userId,
      rating,
      comment: comment.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      setError(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["review", orderId] });
    qc.invalidateQueries({ queryKey: ["vendor-reviews", vendorId] });
  };

  return (
    <div className="mt-6 rounded-2xl border border-border bg-card p-4">
      <div className="text-sm font-black" style={{ color: primary }}>{t("rateYourVisit")}</div>
      <p className="mt-1 text-xs text-muted-foreground">{t("rateHint")}</p>
      <div className="mt-3"><StarRating value={rating} onChange={setRating} /></div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t("commentOptional")}
        rows={3}
        className="mt-3 w-full rounded-xl border border-border bg-background p-2 text-sm"
      />
      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
      <button
        onClick={submit}
        disabled={submitting}
        className="mt-3 w-full rounded-full py-2 text-sm font-bold text-white disabled:opacity-60"
        style={{ background: primary }}
      >
        {t("submitReview")}
      </button>
    </div>
  );
}