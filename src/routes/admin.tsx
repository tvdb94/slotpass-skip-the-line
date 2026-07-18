import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

type Application = {
  id: string;
  business_name: string;
  contact_name: string;
  contact_email: string;
  phone: string | null;
  cuisine: string;
  address: string | null;
  description: string | null;
  status: string;
  review_notes: string | null;
  created_at: string;
};

function slugify(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function AdminPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user;
      if (!u) { if (!cancel) { setLoading(false); setIsAdmin(false); } return; }
      const { data: role } = await supabase
        .from("user_roles").select("role").eq("user_id", u.id).eq("role", "admin").maybeSingle();
      if (cancel) return;
      setIsAdmin(!!role);
      if (role) await reload();
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  async function reload() {
    const { data } = await supabase
      .from("vendor_applications")
      .select("id,business_name,contact_name,contact_email,phone,cuisine,address,description,status,review_notes,created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setApps((data ?? []) as Application[]);
  }

  async function approve(a: Application) {
    const suggested = slugify(a.business_name);
    const slug = window.prompt(`${t("slugLabel")}:`, suggested);
    if (!slug) return;
    setBusyId(a.id);
    const { error } = await supabase.rpc("approve_vendor_application", {
      _application_id: a.id,
      _slug: slug.trim(),
    });
    setBusyId(null);
    if (error) { setFlash(error.message); setTimeout(() => setFlash(null), 3000); return; }
    setFlash(`✓ ${a.business_name}`);
    setTimeout(() => setFlash(null), 1800);
    reload();
  }

  async function reject(a: Application) {
    const notes = window.prompt(t("reviewNotes"), "") ?? "";
    setBusyId(a.id);
    const { error } = await supabase.rpc("reject_vendor_application", {
      _application_id: a.id,
      _notes: notes,
    });
    setBusyId(null);
    if (error) { setFlash(error.message); setTimeout(() => setFlash(null), 3000); return; }
    reload();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-4 pt-6 text-sm text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-md px-4 pt-10 text-center">
          <p className="text-sm text-muted-foreground">{t("notAuthorized")}</p>
          <Link to="/" className="mt-4 inline-block rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background">
            {t("backToHome")}
          </Link>
        </div>
      </div>
    );
  }

  const pending = apps.filter((a) => a.status === "pending");
  const past = apps.filter((a) => a.status !== "pending");

  return (
    <div className="min-h-screen bg-background pb-10">
      <Header />
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <h1 className="text-2xl font-black">{t("admin")} · {t("adminQueue")}</h1>
        {flash && <div className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs font-semibold">{flash}</div>}

        <section className="mt-4">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("pending")}</h2>
          {pending.length === 0 ? (
            <div className="mt-2 rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {t("noPending")}
            </div>
          ) : (
            <ul className="mt-2 space-y-2">
              {pending.map((a) => (
                <li key={a.id} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{a.business_name}</div>
                      <div className="text-xs text-muted-foreground">{a.cuisine}{a.address ? ` · ${a.address}` : ""}</div>
                      <div className="mt-1 text-xs">{a.contact_name} · {a.contact_email}{a.phone ? ` · ${a.phone}` : ""}</div>
                      {a.description && <p className="mt-2 text-xs text-muted-foreground">{a.description}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        disabled={busyId === a.id}
                        onClick={() => approve(a)}
                        className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {t("approve")}
                      </button>
                      <button
                        disabled={busyId === a.id}
                        onClick={() => reject(a)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        {t("reject")}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {past.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("approved")} / {t("rejected")}
            </h2>
            <ul className="mt-2 space-y-1">
              {past.map((a) => (
                <li key={a.id} className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-1.5 text-xs">
                  <span className="truncate font-semibold">{a.business_name}</span>
                  <span className={a.status === "approved" ? "text-emerald-700" : "text-red-700"}>
                    {a.status === "approved" ? t("approved") : t("rejected")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}