import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CartItemSchema = z.object({
  menu_item_id: z.string().uuid(),
  quantity: z.number().int().positive().max(50),
});
const InputSchema = z.object({
  vendorId: z.string().uuid(),
  slotId: z.string().uuid(),
  items: z.array(CartItemSchema).min(1).max(50),
  customerName: z.string().min(1).max(120),
  customerEmail: z.string().email().max(200),
  customerPhone: z.string().max(40).optional().nullable(),
  lang: z.enum(["nl", "en"]).default("nl"),
});

function generateOrderCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function getOrigin(): Promise<string> {
  const { getRequest } = await import("@tanstack/react-start/server");
  const req = getRequest();
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

/**
 * Public: create a Stripe Checkout Session for the given cart.
 *
 * Not gated by requireSupabaseAuth because customers can order as guests.
 * All security-relevant values (prices, discounts, fees, commission) are
 * recomputed server-side from the DB; the client-provided cart only
 * contributes ids + quantities.
 */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getStripe, applicationFeeCents } = await import("./stripe.server");

    // 1. Vendor + Connect check
    const { data: vendor, error: vErr } = await supabaseAdmin
      .from("vendors")
      .select("id, name, slug, service_fee_cents, commission_pct, stripe_account_id, stripe_charges_enabled")
      .eq("id", data.vendorId)
      .maybeSingle();
    if (vErr || !vendor) throw new Error("Vendor not found");
    if (!vendor.stripe_account_id || !vendor.stripe_charges_enabled) {
      throw new Error("This vendor isn't accepting payments yet");
    }

    // 2. Slot capacity check
    const { data: slot, error: sErr } = await supabaseAdmin
      .from("slots")
      .select("id, vendor_id, date, start_time, capacity, orders_count, discount_pct, is_open")
      .eq("id", data.slotId)
      .maybeSingle();
    if (sErr || !slot) throw new Error("Slot not found");
    if (slot.vendor_id !== vendor.id) throw new Error("Slot does not belong to this vendor");
    if (!slot.is_open) throw new Error("Slot is closed");
    if ((slot.orders_count ?? 0) >= slot.capacity) throw new Error("Slot is full");

    // 3. Trusted item pricing
    const menuIds = data.items.map((i) => i.menu_item_id);
    const { data: menuRows } = await supabaseAdmin
      .from("menu_items")
      .select("id, name_nl, name_en, price_cents, is_available, vendor_id")
      .in("id", menuIds);
    const menu = new Map((menuRows ?? []).map((m) => [m.id, m]));
    for (const it of data.items) {
      const m = menu.get(it.menu_item_id);
      if (!m || m.vendor_id !== vendor.id) throw new Error("Menu item not available");
      if (m.is_available === false) throw new Error(`${m.name_nl} is currently unavailable`);
    }

    // 4. Discounts
    const { data: discounts } = await supabaseAdmin
      .from("item_slot_discounts")
      .select("menu_item_id, slot_id, discount_pct, discount_cents")
      .in("menu_item_id", menuIds)
      .eq("slot_id", slot.id);

    // 5. Totals + commission (mirrors client math)
    let subtotal = 0;
    let discount = 0;
    const orderItems: Array<{
      menu_item_id: string; name: string; unit_price_cents: number; quantity: number; discount_cents: number;
    }> = [];
    for (const it of data.items) {
      const m = menu.get(it.menu_item_id)!;
      const lineTotal = m.price_cents * it.quantity;
      subtotal += lineTotal;

      const d = (discounts ?? []).find((x) => x.menu_item_id === it.menu_item_id);
      const dPct = d?.discount_pct ?? 0;
      const dCents = d?.discount_cents ?? 0;
      let lineDiscount = 0;
      if (d) {
        if (dPct > 0) lineDiscount = Math.round((lineTotal * dPct) / 100);
        else if (dCents > 0) lineDiscount = dCents * it.quantity;
      } else if (slot.discount_pct > 0) {
        lineDiscount = Math.round((lineTotal * slot.discount_pct) / 100);
      }
      discount += lineDiscount;
      orderItems.push({
        menu_item_id: m.id,
        name: data.lang === "nl" ? m.name_nl : m.name_en,
        unit_price_cents: m.price_cents,
        quantity: it.quantity,
        discount_cents: lineDiscount,
      });
    }
    const platformFee = vendor.service_fee_cents ?? 0;
    const commissionable = subtotal - discount;
    const commissionPct = Number(vendor.commission_pct ?? 0);
    const commission = Math.round((commissionable * commissionPct) / 100);
    const totalWithFee = subtotal - discount + platformFee;
    if (totalWithFee <= 0) throw new Error("Order total must be positive");
    const appFee = applicationFeeCents(platformFee, commission);

    // 6. Persist pending order + items (admin bypasses RLS; server has validated everything)
    const orderCode = generateOrderCode();
    const qrToken = crypto.randomUUID();
    const { data: order, error: oErr } = await supabaseAdmin
      .from("orders")
      .insert({
        vendor_id: vendor.id,
        slot_id: slot.id,
        order_code: orderCode,
        status: "pending",
        subtotal_cents: subtotal,
        discount_cents: discount,
        service_fee_cents: platformFee,
        total_cents: totalWithFee,
        commission_cents: commission,
        platform_fee_cents: platformFee,
        application_fee_cents: appFee,
        customer_name: data.customerName,
        customer_email: data.customerEmail,
        customer_phone: data.customerPhone || null,
        qr_token: qrToken,
      })
      .select()
      .single();
    if (oErr || !order) throw new Error(oErr?.message ?? "Failed to create order");

    await supabaseAdmin.from("order_items").insert(
      orderItems.map((r) => ({ ...r, order_id: order.id })),
    );

    // 7. Stripe Checkout Session (destination charge + application fee)
    const stripe = getStripe();
    const origin = await getOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: data.lang === "nl" ? "nl" : "en",
      customer_email: data.customerEmail,
      // Payment methods (iDEAL, cards, Apple/Google Pay wallets, etc.) come from the
      // platform's Stripe dashboard settings when payment_method_types is omitted.
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: totalWithFee,
            product_data: {
              name: `${vendor.name} — SlotPass`,
              description: `${orderItems.length} ${orderItems.length === 1 ? "item" : "items"} · ${slot.date} ${slot.start_time.slice(0, 5)}`,
            },
          },
        },
      ],
      payment_intent_data: {
        application_fee_amount: appFee,
        transfer_data: { destination: vendor.stripe_account_id! },
        metadata: {
          order_id: order.id,
          order_code: orderCode,
          vendor_id: vendor.id,
        },
      },
      metadata: {
        order_id: order.id,
        order_code: orderCode,
        vendor_id: vendor.id,
        platform_fee_cents: String(platformFee),
        commission_cents: String(commission),
        application_fee_cents: String(appFee),
      },
      success_url: `${origin}/order/${orderCode}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout?cancelled=1`,
    });

    await supabaseAdmin
      .from("orders")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", order.id);

    return { url: session.url ?? "", orderCode };
  });