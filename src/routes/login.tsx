import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { signInDemo } from "@/lib/auth";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Inloggen — SlotPass" },
      { name: "description", content: "Log in met een demo klant- of verkoperaccount om SlotPass te proberen." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"customer" | "vendor" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loginAs(kind: "customer" | "vendor") {
    setBusy(kind);
    setError(null);
    try {
      await signInDemo(kind);
      navigate({ to: kind === "vendor" ? "/" : "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-3xl font-black tracking-tight">{t("demoLoginTitle")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("demoLoginSubtitle")}</p>

        <div className="mt-6 grid gap-3">
          <button
            onClick={() => loginAs("customer")}
            disabled={busy !== null}
            className="group flex items-center justify-between rounded-2xl border-2 border-border bg-card p-5 text-left transition hover:border-foreground disabled:opacity-60"
          >
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("customer")}</div>
              <div className="mt-1 text-lg font-bold">{t("demoCustomer")}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t("customerBlurb")}</div>
            </div>
            <span className="text-2xl">{busy === "customer" ? "…" : "→"}</span>
          </button>

          <button
            onClick={() => loginAs("vendor")}
            disabled={busy !== null}
            className="group flex items-center justify-between rounded-2xl border-2 border-border bg-card p-5 text-left transition hover:border-foreground disabled:opacity-60"
          >
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("vendor")}</div>
              <div className="mt-1 text-lg font-bold">{t("demoVendor")}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t("vendorBlurb")}</div>
            </div>
            <span className="text-2xl">{busy === "vendor" ? "…" : "→"}</span>
          </button>
        </div>

        {error && <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

        <button
          onClick={() => navigate({ to: "/" })}
          className="mt-6 w-full text-center text-sm font-medium text-muted-foreground underline"
        >
          {t("browseWithoutLogin")}
        </button>
      </main>
    </div>
  );
}
