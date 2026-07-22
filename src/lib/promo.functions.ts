import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ValidateSchema = z.object({
  code: z.string().trim().min(2).max(40),
  vendorId: z.string().uuid(),
  subtotalCents: z.number().int().positive(),
  email: z.string().email().max(200).optional().nullable(),
});

/** Public: validate a promo code and return the discount to apply. */
export const validatePromoCode = createServerFn({ method: "POST" })
  .inputValidator((i) => ValidateSchema.parse(i))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("validate_promo_code", {
      _code: data.code,
      _vendor_id: data.vendorId,
      _subtotal_cents: data.subtotalCents,
      _user_id: null,
      _email: data.email ?? null,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("Invalid code");
    return {
      promoCodeId: row.promo_code_id as string,
      discountCents: row.discount_cents as number,
      kind: row.kind as string,
      code: row.code as string,
    };
  });

/** Authenticated: get (or create) the caller's personal referral code. */
export const getMyReferralCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_or_create_my_referral_code");
    if (error) throw new Error(error.message);
    return { code: data as string };
  });