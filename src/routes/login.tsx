import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Inloggen — SlotPass" },
      { name: "description", content: "Log in op de SlotPass back-office." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr) return;
    setBusy(true);
    setError(null);
    try {
      // Email one-time code (6 digits — project mailer_otp_length=6, templates use {{ .Token }}).
      const { error: err } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { shouldCreateUser: true },
      });
      if (err) throw err;
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    const token = code.trim();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token,
        type: "email",
      });
      if (err) throw err;
      navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-3xl font-black tracking-tight">{t("signIn")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("loginSubtitle")}</p>

        {step === "email" ? (
          <form onSubmit={sendCode} className="mt-6 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("emailLabel")}
              </span>
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@business.com"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-60"
            >
              {busy ? "…" : t("sendCode")}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-6 grid gap-3">
            <p className="text-sm text-muted-foreground">
              {t("codeSentTo")} <span className="font-semibold text-foreground">{email}</span>
            </p>
            <label className="grid gap-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t("codeLabel")}
              </span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="123456"
                className="rounded-xl border border-border bg-background px-3 py-2 text-center text-lg font-mono tracking-[0.4em] outline-none focus:border-foreground"
              />
            </label>
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="rounded-full bg-foreground px-4 py-2.5 text-sm font-semibold text-background disabled:opacity-60"
            >
              {busy ? "…" : t("verifyCode")}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="text-center text-sm font-medium text-muted-foreground underline"
            >
              {t("useAnotherEmail")}
            </button>
          </form>
        )}

        {error && (
          <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}
      </main>
    </div>
  );
}
