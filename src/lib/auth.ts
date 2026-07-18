import { supabase } from "@/integrations/supabase/client";

export const DEMO_CUSTOMER = { email: "customer@slotpass.demo", password: "slotpass-demo-2025" };
export const DEMO_VENDOR = { email: "vendor@slotpass.demo", password: "slotpass-demo-2025" };

/** Sign in with a demo account; sign it up first if it doesn't exist yet. */
export async function signInDemo(kind: "customer" | "vendor") {
  const creds = kind === "customer" ? DEMO_CUSTOMER : DEMO_VENDOR;
  const first = await supabase.auth.signInWithPassword(creds);
  if (!first.error) return first.data;

  const signup = await supabase.auth.signUp(creds);
  if (signup.error) throw signup.error;
  // With auto-confirm on, we can sign in immediately.
  const second = await supabase.auth.signInWithPassword(creds);
  if (second.error) throw second.error;

  // On first sign-in as vendor, link to Fabel Friet as staff + grant admin (demo convenience).
  if (kind === "vendor" && second.data.user) {
    const uid = second.data.user.id;
    const { data: vendor } = await supabase.from("vendors").select("id").eq("slug", "fabel-friet").maybeSingle();
    if (vendor) {
      await supabase.from("staff").insert({
        vendor_id: vendor.id,
        auth_user_id: uid,
        email: creds.email,
      });
    }
    // Give the demo vendor account admin rights so they can approve applications in the demo.
    // @ts-expect-error – user_roles types are regenerated after migrations.
    await supabase.from("user_roles").insert({ user_id: uid, role: "admin" });
  }
  return second.data;
}
