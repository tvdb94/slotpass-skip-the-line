// Server-only Stripe client. Never import this file from client code.
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
  _stripe = new Stripe(key, {
    // Pin API version so upstream field changes don't silently break us.
    apiVersion: "2024-06-20" as Stripe.LatestApiVersion,
    typescript: true,
  });
  return _stripe;
}

// Total application fee taken by SlotPass on a given order:
//   platform (service) fee + vendor commission cents.
export function applicationFeeCents(platformFeeCents: number, commissionCents: number): number {
  return Math.max(0, Math.round(platformFeeCents) + Math.round(commissionCents));
}