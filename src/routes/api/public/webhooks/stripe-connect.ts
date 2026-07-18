import { createFileRoute } from "@tanstack/react-router";

// Connect account webhook (for `account.updated` on connected Express accounts).
// Configure this endpoint in the Stripe dashboard as a "Connect" webhook and
// store its signing secret as STRIPE_CONNECT_WEBHOOK_SECRET.
export const Route = createFileRoute("/api/public/webhooks/stripe-connect")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
        const signature = request.headers.get("stripe-signature");
        if (!secret || !signature) return new Response("Missing signature", { status: 400 });

        const rawBody = await request.text();
        const { getStripe } = await import("@/lib/stripe.server");
        const stripe = getStripe();

        let event: import("stripe").Stripe.Event;
        try {
          event = stripe.webhooks.constructEvent(rawBody, signature, secret);
        } catch (err) {
          console.error("[stripe connect webhook] invalid signature", err);
          return new Response("Invalid signature", { status: 400 });
        }

        if (event.type !== "account.updated") return new Response("ok");
        const account = event.data.object as import("stripe").Stripe.Account;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin
          .from("vendors")
          .update({
            stripe_charges_enabled: !!account.charges_enabled,
            stripe_payouts_enabled: !!account.payouts_enabled,
            stripe_details_submitted: !!account.details_submitted,
          })
          .eq("stripe_account_id", account.id);
        return new Response("ok");
      },
    },
  },
});