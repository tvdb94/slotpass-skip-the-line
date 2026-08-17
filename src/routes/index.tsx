import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SlotPass — Back-office" },
      { name: "description", content: "SlotPass vendor & admin back-office." },
    ],
  }),
  component: BackofficeHome,
});

function BackofficeHome() {
  const { t } = useI18n();
  const cards = [
    { to: "/vendor" as const, title: t("dashboard"), hint: t("backofficeDashboardHint") },
    { to: "/admin" as const, title: t("admin"), hint: t("backofficeAdminHint") },
    { to: "/become-vendor" as const, title: t("becomeVendor"), hint: t("backofficeApplyHint") },
  ];
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-black tracking-tight">{t("backoffice")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("backofficeHint")}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.to}
              to={c.to}
              className="rounded-2xl border-2 border-border bg-card p-5 transition hover:border-foreground"
            >
              <div className="text-lg font-bold">{c.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{c.hint}</div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
