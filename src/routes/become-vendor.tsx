import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/become-vendor")({
  head: () => ({
    meta: [
      { title: "Become a vendor — SlotPass" },
      { name: "description", content: "Apply to sell on SlotPass. We review every application manually." },
      { property: "og:title", content: "Become a vendor — SlotPass" },
      { property: "og:description", content: "Apply to sell on SlotPass." },
    ],
  }),
  component: BecomeVendor,
});

function BecomeVendor() {
  const { t } = useI18n();
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      if (data.user?.email && !email) setEmail(data.user.email);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit =
    businessName.trim().length > 1 &&
    contactName.trim().length > 1 &&
    email.includes("@") &&
    cuisine.trim().length > 1 &&
    !submitting;

  async function submit() {
    setSubmitting(true);
    setError(null);
    const { error } = await supabase.from("vendor_applications").insert({
      business_name: businessName.trim(),
      contact_name: contactName.trim(),
      contact_email: email.trim(),
      phone: phone.trim() || null,
      cuisine: cuisine.trim(),
      address: address.trim() || null,
      description: description.trim() || null,
      applicant_user_id: userId,
    });
    setSubmitting(false);
    if (error) { setError(error.message); return; }
    setDone(true);
  }

  if (done) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-md px-4 pt-10 text-center">
          <div className="text-4xl">✅</div>
          <h1 className="mt-2 text-xl font-black">{t("applicationSubmitted")}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("applicationSubmittedDetail")}</p>
          <Link to="/" className="mt-6 inline-block rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">
            {t("backToHome")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-10">
      <Header />
      <div className="mx-auto max-w-md px-4 pt-4">
        <h1 className="text-2xl font-black">{t("becomeVendorTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("becomeVendorSubtitle")}</p>

        <div className="mt-5 space-y-2">
          <Field label={t("businessName")} value={businessName} onChange={setBusinessName} />
          <Field label={t("contactName")} value={contactName} onChange={setContactName} />
          <Field label={t("email")} value={email} onChange={setEmail} type="email" />
          <Field label={t("phone")} value={phone} onChange={setPhone} type="tel" />
          <Field label={t("cuisineLabel")} value={cuisine} onChange={setCuisine} />
          <Field label={t("addressLabel")} value={address} onChange={setAddress} />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("aboutBusiness")}
            rows={4}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
          />
        </div>

        {error && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <button
          onClick={submit}
          disabled={!canSubmit}
          className="mt-4 w-full rounded-2xl bg-foreground px-4 py-3 text-sm font-black text-background disabled:opacity-50"
        >
          {submitting ? t("loading") : t("submitApplication")}
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={label}
      type={type}
      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
    />
  );
}