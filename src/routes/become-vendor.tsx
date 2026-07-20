import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/become-vendor")({
  head: () => ({
    meta: [
      { title: "Become a vendor — SlotPass" },
      { name: "description", content: "Set up your SlotPass store in minutes: branding, menu, and pickup slots." },
      { property: "og:title", content: "Become a vendor — SlotPass" },
      { property: "og:description", content: "Set up your SlotPass store in minutes." },
    ],
  }),
  component: BecomeVendorWizard,
});

type MenuDraftItem = { name: string; category: string; price_cents: number };
type SlotsDraft = { days: number[]; start: string; end: string; interval_min: 15; capacity: number };

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function BecomeVendorWizard() {
  const { t, lang } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Auth
  const [userId, setUserId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checkEmail, setCheckEmail] = useState(false);

  // Business
  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [cuisine, setCuisine] = useState("");
  const [address, setAddress] = useState("");

  // Branding
  const [proposedSlug, setProposedSlug] = useState("");
  const [brandPrimary, setBrandPrimary] = useState("#111827");
  const [headlineNl, setHeadlineNl] = useState("");
  const [headlineEn, setHeadlineEn] = useState("");
  const [heroDescription, setHeroDescription] = useState("");

  // Menu draft
  const [menu, setMenu] = useState<MenuDraftItem[]>([
    { name: "", category: "Menu", price_cents: 0 },
  ]);

  // Slots draft
  const [slots, setSlots] = useState<SlotsDraft>({
    days: [1, 2, 3, 4, 5],
    start: "12:00",
    end: "14:00",
    interval_min: 15,
    capacity: 6,
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUserId(data.user.id);
        if (data.user.email) setEmail(data.user.email);
        setStep((s) => (s === 1 ? 2 : s));
      }
    });
  }, []);

  useEffect(() => {
    if (!proposedSlug && businessName) setProposedSlug(slugify(businessName));
  }, [businessName, proposedSlug]);

  const totalSteps = 6;

  async function handleAuth() {
    setError(null);
    if (!email.includes("@")) { setError(t("email")); return; }
    if (password.length < 8) { setError(t("wizardPasswordShort")); return; }
    setBusy(true);
    if (authMode === "signin") {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) { setError(error.message); return; }
      if (data.user) { setUserId(data.user.id); setStep(2); }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: window.location.origin + "/become-vendor" },
      });
      setBusy(false);
      if (error) { setError(error.message); return; }
      if (data.session && data.user) {
        setUserId(data.user.id);
        setStep(2);
      } else if (data.user) {
        // Some setups return a user w/o session when confirmation required.
        setCheckEmail(true);
      }
    }
  }

  function canAdvance(): string | null {
    if (step === 2) {
      if (businessName.trim().length < 2) return t("businessName");
      if (contactName.trim().length < 2) return t("contactName");
      if (cuisine.trim().length < 2) return t("cuisineLabel");
    }
    if (step === 3) {
      if (!SLUG_RE.test(proposedSlug)) return t("wizardSlugInvalid");
    }
    if (step === 4) {
      const valid = menu.filter((m) => m.name.trim() && m.price_cents > 0);
      if (valid.length === 0) return t("wizardNeedOneItem");
    }
    if (step === 5) {
      if (slots.days.length === 0) return t("wizardNeedOneDay");
    }
    return null;
  }

  function next() {
    const err = canAdvance();
    if (err) { setError(err); return; }
    setError(null);
    setStep((s) => Math.min(totalSteps, s + 1));
  }
  function back() { setError(null); setStep((s) => Math.max(1, s - 1)); }

  async function submit() {
    setError(null);
    setBusy(true);
    const cleanedMenu = menu
      .filter((m) => m.name.trim() && m.price_cents > 0)
      .map((m) => ({
        name: m.name.trim(),
        category: m.category.trim() || "Menu",
        price_cents: Math.round(m.price_cents),
      }));
    const { error } = await supabase.from("vendor_applications").insert({
      business_name: businessName.trim(),
      contact_name: contactName.trim(),
      contact_email: email.trim(),
      phone: phone.trim() || null,
      cuisine: cuisine.trim(),
      address: address.trim() || null,
      description: heroDescription.trim() || null,
      applicant_user_id: userId,
      proposed_slug: proposedSlug.trim(),
      brand_primary: brandPrimary,
      headline_nl: headlineNl.trim() || null,
      headline_en: headlineEn.trim() || null,
      hero_description: heroDescription.trim() || null,
      menu_draft: cleanedMenu,
      slots_draft: slots,
    });
    setBusy(false);
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
          <div className="mt-6 flex flex-col gap-2">
            <Link to="/" className="rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">
              {t("backToHome")}
            </Link>
            <button onClick={() => navigate({ to: "/vendor" })} className="rounded-full border border-border px-4 py-2 text-sm font-semibold">
              {t("dashboard")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      <Header />
      <div className="mx-auto max-w-md px-4 pt-4">
        <h1 className="text-2xl font-black">{t("becomeVendorTitle")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("becomeVendorSubtitle")}</p>

        <StepBar step={step} total={totalSteps} labels={[
          t("wizardAccount"), t("wizardBusiness"), t("wizardBranding"),
          t("wizardMenu"), t("wizardSlots"), t("wizardReview"),
        ]} />

        <div className="mt-5">
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{t("wizardAccountHelp")}</p>
              {checkEmail ? (
                <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{t("wizardCheckEmail")}</div>
              ) : (
                <>
                  <Field label={t("email")} value={email} onChange={setEmail} type="email" />
                  <Field label={t("wizardPassword")} value={password} onChange={setPassword} type="password" />
                  <button
                    disabled={busy}
                    onClick={handleAuth}
                    className="w-full rounded-2xl bg-foreground px-4 py-3 text-sm font-black text-background disabled:opacity-50"
                  >
                    {busy ? t("loading") : authMode === "signup" ? t("wizardCreateAccount") : t("wizardSignIn")}
                  </button>
                  <button
                    onClick={() => { setAuthMode(authMode === "signup" ? "signin" : "signup"); setError(null); }}
                    className="w-full text-xs text-muted-foreground underline"
                  >
                    {authMode === "signup" ? t("wizardAlreadyHave") : t("wizardNeedAccount")}
                  </button>
                </>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <Field label={t("businessName")} value={businessName} onChange={setBusinessName} />
              <Field label={t("contactName")} value={contactName} onChange={setContactName} />
              <Field label={t("phone")} value={phone} onChange={setPhone} type="tel" />
              <Field label={t("cuisineLabel")} value={cuisine} onChange={setCuisine} />
              <Field label={t("addressLabel")} value={address} onChange={setAddress} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div>
                <Field label={t("wizardSlug")} value={proposedSlug} onChange={(v) => setProposedSlug(slugify(v))} />
                <p className="mt-1 text-xs text-muted-foreground">{t("wizardSlugHelp")}</p>
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-border p-3">
                <span className="text-sm font-semibold">{t("wizardBrandColor")}</span>
                <input type="color" value={brandPrimary} onChange={(e) => setBrandPrimary(e.target.value)} className="h-10 w-16 cursor-pointer rounded" />
                <code className="ml-auto text-xs text-muted-foreground">{brandPrimary}</code>
              </label>
              <Field label={t("wizardHeadlineNl")} value={headlineNl} onChange={setHeadlineNl} />
              <Field label={t("wizardHeadlineEn")} value={headlineEn} onChange={setHeadlineEn} />
              <textarea
                value={heroDescription}
                onChange={(e) => setHeroDescription(e.target.value)}
                placeholder={t("wizardHeroDescription")}
                rows={4}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t("wizardMenuHint")}</p>
              {menu.map((m, i) => (
                <div key={i} className="rounded-xl border border-border p-2">
                  <div className="grid grid-cols-6 gap-2">
                    <input
                      value={m.name}
                      onChange={(e) => setMenu(menu.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                      placeholder={t("wizardItemName")}
                      className="col-span-3 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground"
                    />
                    <input
                      value={m.category}
                      onChange={(e) => setMenu(menu.map((x, j) => j === i ? { ...x, category: e.target.value } : x))}
                      placeholder={t("wizardItemCategory")}
                      className="col-span-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground"
                    />
                    <input
                      value={m.price_cents ? (m.price_cents / 100).toString() : ""}
                      onChange={(e) => {
                        const n = parseFloat(e.target.value.replace(",", "."));
                        const cents = isFinite(n) ? Math.round(n * 100) : 0;
                        setMenu(menu.map((x, j) => j === i ? { ...x, price_cents: cents } : x));
                      }}
                      placeholder="€"
                      inputMode="decimal"
                      className="col-span-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-foreground"
                    />
                  </div>
                  {menu.length > 1 && (
                    <button
                      onClick={() => setMenu(menu.filter((_, j) => j !== i))}
                      className="mt-1 text-xs text-muted-foreground underline"
                    >
                      {t("wizardRemove")}
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setMenu([...menu, { name: "", category: menu[menu.length - 1]?.category || "Menu", price_cents: 0 }])}
                className="w-full rounded-xl border border-dashed border-border py-2 text-sm font-semibold"
              >
                + {t("wizardAddItem")}
              </button>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{t("wizardSlotsHint")}</p>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("wizardOpenDays")}</div>
                <div className="flex gap-1">
                  {["Zo","Ma","Di","Wo","Do","Vr","Za"].map((d, idx) => {
                    const on = slots.days.includes(idx);
                    return (
                      <button
                        key={idx}
                        onClick={() => setSlots({
                          ...slots,
                          days: on ? slots.days.filter((x) => x !== idx) : [...slots.days, idx].sort(),
                        })}
                        className={`flex-1 rounded-lg border py-2 text-xs font-bold ${on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs font-semibold">
                  {t("wizardOpenFrom")}
                  <input type="time" step={900} value={slots.start} onChange={(e) => setSlots({ ...slots, start: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs font-semibold">
                  {t("wizardOpenTo")}
                  <input type="time" step={900} value={slots.end} onChange={(e) => setSlots({ ...slots, end: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
                </label>
              </div>
              <label className="block text-xs font-semibold">
                {t("wizardCapacityPerSlot")}
                <input type="number" min={1} max={99} value={slots.capacity}
                  onChange={(e) => setSlots({ ...slots, capacity: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm" />
              </label>
            </div>
          )}

          {step === 6 && (
            <ReviewStep
              t={t}
              lang={lang}
              businessName={businessName}
              cuisine={cuisine}
              address={address}
              slug={proposedSlug}
              brand={brandPrimary}
              menuCount={menu.filter((m) => m.name.trim() && m.price_cents > 0).length}
              slots={slots}
            />
          )}
        </div>

        {error && <div className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {step !== 1 && !done && (
          <div className="mt-5 flex gap-2">
            <button onClick={back} className="flex-1 rounded-2xl border border-border px-4 py-3 text-sm font-semibold">
              {t("wizardBack")}
            </button>
            {step < totalSteps ? (
              <button onClick={next} className="flex-1 rounded-2xl bg-foreground px-4 py-3 text-sm font-black text-background">
                {t("wizardNext")}
              </button>
            ) : (
              <button onClick={submit} disabled={busy} className="flex-1 rounded-2xl bg-foreground px-4 py-3 text-sm font-black text-background disabled:opacity-50">
                {busy ? t("loading") : t("wizardSubmit")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepBar({ step, total, labels }: { step: number; total: number; labels: string[] }) {
  const pct = Math.round((step / total) * 100);
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        <span>{labels[step - 1]}</span>
        <span>{step} / {total}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ReviewStep(props: {
  t: (k: any) => string;
  lang: string;
  businessName: string; cuisine: string; address: string; slug: string; brand: string;
  menuCount: number; slots: SlotsDraft;
}) {
  const { t, businessName, cuisine, address, slug, brand, menuCount, slots } = props;
  const dayLabels = ["Zo","Ma","Di","Wo","Do","Vr","Za"];
  const openDays = slots.days.map((d) => dayLabels[d]).join(", ");
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t("wizardReviewHint")}</p>
      <div className="rounded-2xl border border-border p-3 text-sm">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full" style={{ backgroundColor: brand }} />
          <div>
            <div className="font-bold">{businessName}</div>
            <div className="text-xs text-muted-foreground">{cuisine}{address ? ` · ${address}` : ""}</div>
          </div>
        </div>
        <dl className="mt-3 space-y-1 text-xs">
          <Row k="URL" v={`slotpass.app/${slug}`} />
          <Row k={t("wizardMenu")} v={`${menuCount} ${t("draftMenu")}`} />
          <Row k={t("wizardOpenDays")} v={openDays} />
          <Row k={t("wizardOpenFrom")} v={`${slots.start} – ${slots.end}`} />
          <Row k={t("wizardCapacityPerSlot")} v={String(slots.capacity)} />
        </dl>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
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