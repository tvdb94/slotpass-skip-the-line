import { createFileRoute } from "@tanstack/react-router";

// Direct-charge Checkout webhook (platform account).
// Verifies signature with STRIPE_WEBHOOK_SECRET, then flips the order to paid.
export const Route = createFileRoute("/api/public/webhooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        const signature = request.headers.get("stripe-signature");
        if (!secret || !signature) {
          return new Response("Missing signature", { status: 400 });
        }

        const rawBody = await request.text();
        const { getStripe } = await import("@/lib/stripe.server");
        const stripe = getStripe();

        let event: import("stripe").Stripe.Event;
        try {
          event = stripe.webhooks.constructEvent(rawBody, signature, secret);
        } catch (err) {
          console.error("[stripe webhook] invalid signature", err);
          return new Response("Invalid signature", { status: 400 });
        }

        if (event.type !== "checkout.session.completed") {
          return new Response("ok");
        }

        const session = event.data.object as import("stripe").Stripe.Checkout.Session;
        const orderId = session.metadata?.order_id;
        if (!orderId) {
          console.warn("[stripe webhook] session without order_id metadata", session.id);
          return new Response("ok");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency: only transition pending→paid.
        const { data: existing } = await supabaseAdmin
          .from("orders")
          .select("id, status, slot_id")
          .eq("id", orderId)
          .maybeSingle();
        if (!existing) return new Response("ok");
        if (existing.status !== "pending") return new Response("ok");

        const platformFee = Number(session.metadata?.platform_fee_cents ?? 0);
        const applicationFee = Number(session.metadata?.application_fee_cents ?? 0);
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        await supabaseAdmin
          .from("orders")
          .update({
            status: "paid",
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: paymentIntentId,
            platform_fee_cents: platformFee,
            application_fee_cents: applicationFee,
          })
          .eq("id", orderId);

        // Bump slot orders_count (fire-and-forget; slot may be null if legacy row)
        if (existing.slot_id) {
          const { data: slot } = await supabaseAdmin
            .from("slots").select("orders_count").eq("id", existing.slot_id).maybeSingle();
          if (slot) {
            await supabaseAdmin
              .from("slots")
              .update({ orders_count: (slot.orders_count ?? 0) + 1 })
              .eq("id", existing.slot_id);
          }
        }

        return new Response("ok");
      },
    },
  },
});