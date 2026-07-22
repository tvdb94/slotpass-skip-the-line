import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { formatEUR, formatTime } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { createCheckoutSession } from "@/lib/checkout.functions";
import { validatePromoCode } from "@/lib/promo.functions";

export const Route = createFileRoute("/checkout")({
  component: Checkout,
  validateSearch: (s: Record<string, unknown>) => ({
    waitlist: typeof s.waitlist === "string" ? s.waitlist : undefined,
    cancelled: s.cancelled === "1" || s.cancelled === 1 ? 1 : undefined,
    ref: typeof s.ref === "string" ? s.ref : undefined,
  }),
});

type Vendor = {
  id: string; slug: string; name: string; brand_primary: string | null;
  service_fee_cents: number; commission_pct: number;
  stripe_account_id: string | null; stripe_charges_enabled: boolean;
};
type Slot = {
  id: string; vendor_id: string; date: string; start_time: string; end_time: string;
  capacity: number; orders_count: number; discount_pct: number; auto_discount_pct: number; is_open: boolean;
  priority_capacity: number; priority_upcharge_cents: number; priority_taken: number;
};
type ItemDiscount = { menu_item_id: string; slot_id: string; discount_pct: number; discount_cents: number };

function Checkout() {
  const { t, lang } = useI18n();
  const { cart, setSlot, clear, totalCents } = useCart();
  const navigate = useNavigate();
  const search = useSearch({ from: "/checkout" });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priority, setPriority] = useState(false);
  const [waitlistBusy, setWaitlistBusy] = useState(false);
  const [waitlistMsg, setWaitlistMsg] = useState<string | null>(null);
  const createSession = useServerFn(createCheckoutSession);
  const validatePromo = useServerFn(validatePromoCode);
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState<{ code: string; discountCents: number } | null>(null);
  const [promoErr, setPromoErr] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);

  const vendorQ = useQuery({
    enabled: !!cart.vendor_id,
    queryKey: ["vendor-checkout", cart.vendor_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("id,slug,name,brand_primary,service_fee_cents,commission_pct,stripe_account_id,stripe_charges_enabled")
        .eq("id", cart.vendor_id!)
        .maybeSingle();
      if (error) throw error;
      return data as Vendor | null;
    },
  });

  const slotsQ = useQuery({
    enabled: !!cart.vendor_id,
    queryKey: ["vendor-slots", cart.vendor_id],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("slots")
        .select("*")
        .eq("vendor_id", cart.vendor_id!)
        .eq("is_open", true)
        .gte("date", today)
        .order("date")
        .order("start_time");
      if (error) throw error;
      return data as Slot[];
    },
  });

  const discountsQ = useQuery({
    enabled: !!cart.vendor_id && cart.items.length > 0,
    queryKey: ["item-discounts", cart.vendor_id, cart.items.map((i) => i.menu_item_id).join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("item_slot_discounts")
        .select("menu_item_id,slot_id,discount_pct,discount_cents")
        .in("menu_item_id", cart.items.map((i) => i.menu_item_id));
      if (error) throw error;
      return data as ItemDiscount[];
    },
  });

  const vendor = vendorQ.data ?? null;
  const slots = slotsQ.data ?? [];
  const discounts = discountsQ.data ?? [];
  const primary = vendor?.brand_primary ?? "#111111";

  // Prefill promo from ?ref= or persisted referral
  useEffect(() => {
    if (promoInput) return;
    const ref = search.ref || (typeof window !== "undefined" ? localStorage.getItem("slotpass.ref") : null);
    if (ref) setPromoInput(ref);
    if (search.ref && typeof window !== "undefined") localStorage.setItem("slotpass.ref", search.ref);
  }, [search.ref]); // eslint-disable-line react-hooks/exhaustive-deps

  // Only future slots with capacity
  const availableSlots = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return slots.filter((s) => {
      const stMin = Number(s.start_time.slice(0, 2)) * 60 + Number(s.start_time.slice(3, 5));
      return s.date > today || (s.date === today && stMin > nowMin);
    });
  }, [slots]);

  // Auto-select first slot if none picked
  useEffect(() => {
    if (!cart.slot_id && availableSlots.length > 0) setSlot(availableSlots[0].id);
  }, [availableSlots, cart.slot_id, setSlot]);

  const selectedSlot = availableSlots.find((s) => s.id === cart.slot_id) ?? null;
  const selectedFull = selectedSlot ? selectedSlot.orders_count >= selectedSlot.capacity : false;
  const priorityAvail = selectedSlot
    ? (selectedSlot.priority_capacity ?? 0) > 0 &&
      (selectedSlot.priority_taken ?? 0) < (selectedSlot.priority_capacity ?? 0)
    : false;

  // Waitlist-offer claim: prefill from entry, force-select its slot, disable priority
  const waitlistId = search.waitlist;
  const waitlistQ = useQuery({
    enabled: !!waitlistId,
    queryKey: ["waitlist-entry", waitlistId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waitlist_entries")
        .select("id, slot_id, status, offer_expires_at, customer_email, customer_name")
        .eq("id", waitlistId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    const w = waitlistQ.data;
    if (!w) return;
    if (w.status === "offered" && w.slot_id) {
      setSlot(w.slot_id);
      if (!email) setEmail(w.customer_email ?? "");
      if (!name && w.customer_name) setName(w.customer_name);
    }
  }, [waitlistQ.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const waitlistOffer = waitlistQ.data && waitlistQ.data.status === "offered" ? waitlistQ.data : null;
  const waitlistExpired = waitlistOffer && waitlistOffer.offer_expires_at
    ? new Date(waitlistOffer.offer_expires_at) < new Date()
    : false;

  useEffect(() => {
    if (!priorityAvail) setPriority(false);
  }, [priorityAvail]);

  // Compute per-item discount for the selected slot
  const { subtotalCents, discountCents, serviceFeeCents, totalWithFeeCents, commissionCents, promoDiscountCents } = useMemo(() => {
    let subtotal = 0;
    let discount = 0;
    for (const item of cart.items) {
      const lineTotal = item.price_cents * item.quantity;
      subtotal += lineTotal;
      if (!selectedSlot) continue;
      const d = discounts.find(
        (x) => x.menu_item_id === item.menu_item_id && x.slot_id === selectedSlot.id,
      );
      if (d) {
        if (d.discount_pct > 0) discount += Math.round((lineTotal * d.discount_pct) / 100);
        else if (d.discount_cents > 0) discount += d.discount_cents * item.quantity;
      } else {
        const eff = Math.max(selectedSlot.discount_pct ?? 0, Number(selectedSlot.auto_discount_pct ?? 0));
        if (eff > 0) discount += Math.round((lineTotal * eff) / 100);
      }
    }
    const fee = vendor?.service_fee_cents ?? 0;
    const netAfterSlot = subtotal - discount;
    const promoD = promo ? Math.min(netAfterSlot, promo.discountCents) : 0;
    const commissionable = netAfterSlot - promoD;
    const commissionPct = vendor?.commission_pct ?? 0;
    const commissionCents = Math.round((Math.max(0, commissionable) * Number(commissionPct)) / 100);
    const priorityUp = priority ? (selectedSlot?.priority_upcharge_cents ?? 0) : 0;
    return {
      subtotalCents: subtotal,
      discountCents: discount,
      serviceFeeCents: fee,
      totalWithFeeCents: subtotal - discount - promoD + fee + priorityUp,
      commissionCents,
      promoDiscountCents: promoD,
    };
  }, [cart.items, discounts, selectedSlot, vendor, priority, promo]);

  const seatOk =
    !selectedSlot ||
    (priority && priorityAvail) ||
    !!waitlistOffer ||
    selectedSlot.orders_count < selectedSlot.capacity;
  const canPay =
    !!vendor && !!selectedSlot && seatOk && cart.items.length > 0 && name.trim().length > 1 && email.includes("@");

  // Vendors that finished Stripe Connect onboarding accept real payments;
  // demo vendors seeded without a connected account still run the simulate flow.
  const stripeMode = !!vendor?.stripe_account_id && !!vendor?.stripe_charges_enabled;
  const stripePending = !!vendor?.stripe_account_id && !vendor.stripe_charges_enabled;

  const groupedSlots = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of availableSlots) {
      const arr = map.get(s.date) ?? [];
      arr.push(s);
      map.set(s.date, arr);
    }
    return Array.from(map.entries());
  }, [availableSlots]);

  async function simulatePayment() {
    if (!canPay || !vendor || !selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const orderCode = generateOrderCode();
      const qrToken = crypto.randomUUID();
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          vendor_id: vendor.id,
          slot_id: selectedSlot.id,
          order_code: orderCode,
          status: "paid",
          subtotal_cents: subtotalCents,
          discount_cents: discountCents,
          service_fee_cents: serviceFeeCents,
          total_cents: totalWithFeeCents,
          commission_cents: commissionCents,
          platform_fee_cents: serviceFeeCents,
          application_fee_cents: serviceFeeCents + commissionCents,
          customer_name: name,
          customer_email: email,
          customer_phone: phone || null,
          qr_token: qrToken,
          paid_at: new Date().toISOString(),
          promo_discount_cents: promoDiscountCents,
        })
        .select()
        .single();
      if (orderErr) throw orderErr;

      const { error: itemsErr } = await supabase.from("order_items").insert(
        cart.items.map((i) => {
          const d = discounts.find(
            (x) => x.menu_item_id === i.menu_item_id && x.slot_id === selectedSlot.id,
          );
          const perLineDiscount = d
            ? d.discount_pct > 0
              ? Math.round((i.price_cents * i.quantity * d.discount_pct) / 100)
              : d.discount_cents * i.quantity
            : selectedSlot.discount_pct > 0
              ? Math.round((i.price_cents * i.quantity * selectedSlot.discount_pct) / 100)
              : 0;
          return {
            order_id: order.id,
            menu_item_id: i.menu_item_id,
            name: i.name,
            unit_price_cents: i.price_cents,
            discount_cents: perLineDiscount,
            quantity: i.quantity,
          };
        }),
      );
      if (itemsErr) throw itemsErr;

      // Bump slot orders_count (best-effort; RLS allows staff-only update, so this may no-op for anon)
      await supabase
        .from("slots")
        .update({ orders_count: selectedSlot.orders_count + 1 })
        .eq("id", selectedSlot.id);

      clear();
      navigate({ to: "/order/$code", params: { code: orderCode } });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function payWithStripe() {
    if (!canPay || !vendor || !selectedSlot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await createSession({
        data: {
          vendorId: vendor.id,
          slotId: selectedSlot.id,
          items: cart.items.map((i) => ({ menu_item_id: i.menu_item_id, quantity: i.quantity })),
          customerName: name,
          customerEmail: email,
          customerPhone: phone || null,
          lang,
          isPriority: priority && priorityAvail,
          waitlistEntryId: waitlistOffer ? waitlistOffer.id : null,
          promoCode: promo?.code ?? null,
        },
      });
      if (!res.url) throw new Error("Stripe returned no checkout URL");
      clear();
      window.location.href = res.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  }

  async function joinWaitlist() {
    if (!vendor || !selectedSlot || !email.includes("@") || name.trim().length < 2) return;
    setWaitlistBusy(true);
    setWaitlistMsg(null);
    try {
      const { error } = await supabase.from("waitlist_entries").insert({
        vendor_id: vendor.id,
        slot_id: selectedSlot.id,
        customer_name: name,
        customer_email: email,
        party_size: cart.items.reduce((n, i) => n + i.quantity, 0),
      });
      if (error) throw error;
      setWaitlistMsg(lang === "nl"
        ? "Je staat op de wachtlijst. Je krijgt een link zodra er plek vrijkomt."
        : "You're on the waitlist. We'll email you a link if a spot opens up.");
    } catch (e) {
      setWaitlistMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setWaitlistBusy(false);
    }
  }

  async function applyPromo() {
    if (!vendor || !promoInput.trim()) return;
    setPromoBusy(true);
    setPromoErr(null);
    try {
      const netSubtotal = Math.max(1, subtotalCents - discountCents);
      const res = await validatePromo({
        data: {
          code: promoInput.trim(),
          vendorId: vendor.id,
          subtotalCents: netSubtotal,
          email: email || null,
        },
      });
      setPromo({ code: res.code, discountCents: res.discountCents });
    } catch (e) {
      setPromo(null);
      setPromoErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPromoBusy(false);
    }
  }
  function removePromo() {
    setPromo(null);
    setPromoInput("");
    setPromoErr(null);
  }

  if (!cart.vendor_id || cart.items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-4 pt-8 text-center">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
          <Link to="/" className="mt-4 inline-block rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">
            {t("backToHome")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <Header />
      <div className="mx-auto max-w-3xl px-4 pt-4">
        {vendor && (
          <Link
            to="/$slug"
            params={{ slug: vendor.slug }}
            className="text-xs font-semibold text-muted-foreground underline"
          >
            ← {vendor.name}
          </Link>
        )}
        <h1 className="mt-2 text-2xl font-black" style={{ color: primary }}>
          {t("checkout")}
        </h1>

        {/* Items */}
        <section className="mt-4 rounded-2xl border border-border bg-card p-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("yourOrder")}</h2>
          <ul className="mt-2 divide-y divide-border">
            {cart.items.map((i) => (
              <li key={i.menu_item_id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{i.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {i.quantity} × {formatEUR(i.price_cents)}
                  </div>
                </div>
                <div className="shrink-0 font-bold">{formatEUR(i.price_cents * i.quantity)}</div>
              </li>
            ))}
          </ul>
        </section>

        {/* Slot picker */}
        <section className="mt-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("pickupSlot")}</h2>
          {slotsQ.isLoading ? (
            <div className="mt-2 text-sm text-muted-foreground">{t("loading")}</div>
          ) : availableSlots.length === 0 ? (
            <div className="mt-2 text-sm text-muted-foreground">{t("unavailable")}</div>
          ) : (
            <div className="mt-2 space-y-3">
              {groupedSlots.map(([date, list]) => (
                <div key={date}>
                  <div className="text-xs font-semibold text-muted-foreground">{labelDate(date, lang)}</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {list.map((s) => {
                      const active = s.id === cart.slot_id;
                      const full = s.orders_count >= s.capacity;
                      const hasPri = (s.priority_capacity ?? 0) > 0 &&
                        (s.priority_taken ?? 0) < (s.priority_capacity ?? 0);
                      const disabled = full && !hasPri;
                      return (
                        <button
                          key={s.id}
                          disabled={disabled}
                          onClick={() => setSlot(s.id)}
                          className="rounded-full border px-3 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                          style={
                            active
                              ? { background: primary, color: "#fff", borderColor: primary }
                              : undefined
                          }
                        >
                          {formatTime(s.start_time)}
                          {full && hasPri && (
                            <span className="ml-1 opacity-80">
                              {lang === "nl" ? "· priority" : "· priority"}
                            </span>
                          )}
                          {(() => {
                            const eff = Math.max(s.discount_pct ?? 0, Number(s.auto_discount_pct ?? 0));
                            return eff > 0 ? (
                              <span className="ml-1 opacity-80">−{Math.round(eff)}%</span>
                            ) : null;
                          })()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Priority tier toggle */}
          {selectedSlot && priorityAvail && !waitlistOffer && (
            <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3 text-sm">
              <span>
                <span className="font-bold">
                  {lang === "nl" ? "Prioriteit ophaal" : "Priority pickup"}
                </span>
                <span className="ml-1 text-xs text-muted-foreground">
                  {lang === "nl" ? "vooraan in de rij" : "skip the queue"}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">
                  +{formatEUR(selectedSlot.priority_upcharge_cents ?? 0)}
                </span>
                <input
                  type="checkbox"
                  checked={priority}
                  onChange={(e) => setPriority(e.target.checked)}
                  className="h-4 w-4"
                />
              </span>
            </label>
          )}

          {/* Waitlist offer banner */}
          {waitlistOffer && !waitlistExpired && (
            <div className="mt-3 rounded-2xl border border-emerald-300/60 bg-emerald-50 p-3 text-sm text-emerald-800">
              {lang === "nl"
                ? "Er is een plek vrijgekomen — bevestig binnen 10 minuten."
                : "A spot opened up — confirm within 10 minutes."}
            </div>
          )}
          {waitlistOffer && waitlistExpired && (
            <div className="mt-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-800">
              {lang === "nl" ? "Deze aanbieding is verlopen." : "This offer has expired."}
            </div>
          )}

          {/* Full-slot waitlist join */}
          {selectedSlot && selectedFull && !priorityAvail && !waitlistOffer && (
            <div className="mt-3 rounded-2xl border border-border bg-card p-3 text-sm">
              <div className="font-bold">
                {lang === "nl" ? "Deze slot is vol" : "This slot is full"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {lang === "nl"
                  ? "Zet je op de wachtlijst; we mailen je zodra er plek vrijkomt."
                  : "Join the waitlist — we'll email you if a spot opens up."}
              </div>
              <button
                onClick={joinWaitlist}
                disabled={waitlistBusy || !email.includes("@") || name.trim().length < 2}
                className="mt-2 rounded-full border border-border px-3 py-1 text-xs font-bold disabled:opacity-40"
              >
                {waitlistBusy
                  ? t("loading")
                  : lang === "nl" ? "Op wachtlijst" : "Join waitlist"}
              </button>
              {waitlistMsg && (
                <div className="mt-2 text-xs text-muted-foreground">{waitlistMsg}</div>
              )}
            </div>
          )}
        </section>

        {/* Contact */}
        <section className="mt-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("contact")}</h2>
          <div className="mt-2 space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("name")}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder={t("email")}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              placeholder={t("phone")}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
            />
          </div>
        </section>

        {/* Totals */}
        <section className="mt-5 rounded-2xl border border-border bg-card p-3 text-sm">
          <Row label={t("subtotal")} value={formatEUR(subtotalCents)} />
          {discountCents > 0 && (
            <Row label={`${t("offPeak")} ${t("off")}`} value={`− ${formatEUR(discountCents)}`} />
          )}
          <Row label={t("serviceFee")} value={formatEUR(serviceFeeCents)} />
          {priority && priorityAvail && selectedSlot && (
            <Row
              label={lang === "nl" ? "Prioriteit" : "Priority"}
              value={`+ ${formatEUR(selectedSlot.priority_upcharge_cents ?? 0)}`}
            />
          )}
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2 font-black">
            <span>{t("total")}</span>
            <span style={{ color: primary }}>{formatEUR(totalWithFeeCents)}</span>
          </div>
        </section>

        {error && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {stripePending ? (
          <div className="mt-4 rounded-2xl border border-amber-300/60 bg-amber-50 p-3 text-center text-sm text-amber-800">
            {t("stripeNotAcceptingYet")}
          </div>
        ) : stripeMode ? (
          <>
            <button
              onClick={payWithStripe}
              disabled={!canPay || submitting}
              className="mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black text-white shadow-lg transition disabled:opacity-50"
              style={{ background: primary }}
            >
              {submitting ? t("loading") : `${t("payWithStripe")} · ${formatEUR(totalWithFeeCents)}`}
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {lang === "nl"
                ? "Betaal met iDEAL, creditcard, Apple Pay of Google Pay."
                : "Pay with iDEAL, card, Apple Pay or Google Pay."}
            </p>
          </>
        ) : (
          <>
            <button
              onClick={simulatePayment}
              disabled={!canPay || submitting}
              className="mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black text-white shadow-lg transition disabled:opacity-50"
              style={{ background: primary }}
            >
              {submitting ? t("loading") : `${t("simulatePayment")} · ${formatEUR(totalWithFeeCents)}`}
            </button>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {lang === "nl"
                ? "Demo-modus. Deze verkoper heeft Stripe nog niet gekoppeld."
                : "Demo mode. This vendor hasn't connected Stripe yet."}
            </p>
          </>
        )}

        {/* Reference totalCents for cart-store parity */}
        <div className="sr-only">{formatEUR(totalCents)}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function labelDate(date: string, lang: "nl" | "en") {
  const today = new Date().toISOString().slice(0, 10);
  const t = new Date();
  t.setDate(t.getDate() + 1);
  const tomorrow = t.toISOString().slice(0, 10);
  if (date === today) return lang === "nl" ? "Vandaag" : "Today";
  if (date === tomorrow) return lang === "nl" ? "Morgen" : "Tomorrow";
  return new Intl.DateTimeFormat(lang === "nl" ? "nl-NL" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(date));
}

function generateOrderCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}