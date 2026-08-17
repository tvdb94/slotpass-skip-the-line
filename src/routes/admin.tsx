import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  proposed_slug: string | null;
  brand_primary: string | null;
  menu_draft: unknown;
  slots_draft: unknown;
};

type VendorRow = {
  id: string;
  slug: string;
  name: string;
  cuisine: string;
  city: string | null;
  brand_primary: string | null;
  is_featured: boolean;
  is_active: boolean;
  rating: number | null;
  rating_count: number | null;
};

type ReviewRow = {
  id: string;
  vendor_id: string;
  rating: number;
  comment: string | null;
  is_hidden: boolean;
  created_at: string;
  vendors: { name: string; slug: string } | null;
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function draftSummary(a: Application): string | null {
  const menu = Array.isArray(a.menu_draft) ? (a.menu_draft as unknown[]).length : 0;
  const s =
    a.slots_draft && typeof a.slots_draft === "object"
      ? (a.slots_draft as Record<string, unknown>)
      : null;
  const days = s && Array.isArray(s.days) ? s.days.length : 0;
  let slotsPerDay = 0;
  if (s && typeof s.start === "string" && typeof s.end === "string") {
    const [sh, sm] = s.start.split(":").map(Number);
    const [eh, em] = s.end.split(":").map(Number);
    const interval = Number(s.interval_min) || 15;
    const mins = eh * 60 + em - (sh * 60 + sm);
    if (mins > 0 && interval > 0) slotsPerDay = Math.floor(mins / interval);
  }
  if (!menu && !slotsPerDay) return null;
  const parts: string[] = [];
  if (menu) parts.push(`${menu} items`);
  if (slotsPerDay) parts.push(`${slotsPerDay} slots × ${days || 0}d`);
  return parts.join(" · ");
}

function AdminPage() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [apps, setApps] = useState<Application[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<"apps" | "vendors" | "reviews">("apps");
  const [vendors, setVendors] = useState<VendorRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [cityFilter, setCityFilter] = useState<string>("");
  const [cityDraft, setCityDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const u = userData.user;
      if (!u) {
        if (!cancel) {
          setLoading(false);
          setIsAdmin(false);
        }
        return;
      }
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.id)
        .eq("role", "admin")
        .maybeSingle();
      if (cancel) return;
      setIsAdmin(!!role);
      if (role) await Promise.all([reload(), reloadVendors(), reloadReviews()]);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function reload() {
    const { data } = await supabase
      .from("vendor_applications")
      .select(
        "id,business_name,contact_name,contact_email,phone,cuisine,address,description,status,review_notes,created_at,proposed_slug,brand_primary,menu_draft,slots_draft",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    setApps((data ?? []) as Application[]);
  }

  async function reloadVendors() {
    const { data } = await supabase
      .from("vendors")
      .select("id,slug,name,cuisine,city,brand_primary,is_featured,is_active,rating,rating_count")
      .order("name", { ascending: true })
      .limit(500);
    setVendors((data ?? []) as VendorRow[]);
    setCityDraft(Object.fromEntries((data ?? []).map((v) => [v.id, v.city ?? ""])));
  }

  async function reloadReviews() {
    const { data } = await supabase
      .from("reviews")
      .select("id,vendor_id,rating,comment,is_hidden,created_at,vendors(name,slug)")
      .order("created_at", { ascending: false })
      .limit(200);
    setReviews((data ?? []) as unknown as ReviewRow[]);
  }

  // is_featured/is_active are admin-owned columns: the `authenticated` UPDATE grant was
  // revoked (B88), so writes go through the SECURITY DEFINER admin_set_vendor_flags RPC
  // (has_role(admin)-gated). Both flags are sent explicitly to avoid clobbering the other.
  async function setFlags(v: VendorRow, next: { is_featured: boolean; is_active: boolean }) {
    setBusyId(v.id);
    const { error } = await supabase.rpc("admin_set_vendor_flags", {
      _vendor_id: v.id,
      _is_featured: next.is_featured,
      _is_active: next.is_active,
    });
    setBusyId(null);
    if (error) {
      setFlash(error.message);
      setTimeout(() => setFlash(null), 3000);
      return;
    }
    reloadVendors();
  }

  function toggleFeatured(v: VendorRow) {
    return setFlags(v, { is_featured: !v.is_featured, is_active: v.is_active });
  }

  function toggleActive(v: VendorRow) {
    return setFlags(v, { is_featured: v.is_featured, is_active: !v.is_active });
  }

  async function saveCity(v: VendorRow) {
    const city = (cityDraft[v.id] ?? "").trim() || null;
    setBusyId(v.id);
    await supabase.from("vendors").update({ city }).eq("id", v.id);
    setBusyId(null);
    reloadVendors();
  }

  async function toggleHidden(r: ReviewRow) {
    setBusyId(r.id);
    await supabase.from("reviews").update({ is_hidden: !r.is_hidden }).eq("id", r.id);
    setBusyId(null);
    reloadReviews();
  }

  async function deleteReview(r: ReviewRow) {
    if (!window.confirm(t("delete") + "?")) return;
    setBusyId(r.id);
    await supabase.from("reviews").delete().eq("id", r.id);
    setBusyId(null);
    reloadReviews();
  }

  const cities = useMemo(() => {
    const s = new Set<string>();
    for (const v of vendors) if (v.city) s.add(v.city);
    return Array.from(s).sort();
  }, [vendors]);

  const filteredVendors = cityFilter
    ? vendors.filter((v) => (v.city ?? "") === cityFilter)
    : vendors;

  async function approve(a: Application) {
    const suggested = a.proposed_slug || slugify(a.business_name);
    const slug = window.prompt(`${t("slugLabel")}:`, suggested);
    if (!slug) return;
    setBusyId(a.id);
    const { error } = await supabase.rpc("approve_vendor_application", {
      _application_id: a.id,
      _slug: slug.trim(),
    });
    setBusyId(null);
    if (error) {
      setFlash(error.message);
      setTimeout(() => setFlash(null), 3000);
      return;
    }
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
    if (error) {
      setFlash(error.message);
      setTimeout(() => setFlash(null), 3000);
      return;
    }
    reload();
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-4 pt-6 text-sm text-muted-foreground">
          {t("loading")}
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-md px-4 pt-10 text-center">
          <p className="text-sm text-muted-foreground">{t("notAuthorized")}</p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-full bg-foreground px-4 py-2 text-sm font-semibold text-background"
          >
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
        <h1 className="text-2xl font-black">{t("admin")}</h1>
        <div className="mt-3 flex gap-1 overflow-x-auto rounded-full bg-muted p-1 text-xs font-bold">
          {(
            [
              ["apps", t("adminTabApplications")],
              ["vendors", t("adminTabVendors")],
              ["reviews", t("adminTabReviews")],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`shrink-0 rounded-full px-3 py-1.5 ${tab === k ? "bg-background shadow" : "text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {flash && (
          <div className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs font-semibold">{flash}</div>
        )}

        {tab === "apps" && (
          <section className="mt-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("pending")}
            </h2>
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
                        <div className="flex items-center gap-2 font-bold">
                          {a.brand_primary && (
                            <span
                              className="inline-block h-3 w-3 rounded-full"
                              style={{ backgroundColor: a.brand_primary }}
                            />
                          )}
                          {a.business_name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {a.cuisine}
                          {a.address ? ` · ${a.address}` : ""}
                        </div>
                        <div className="mt-1 text-xs">
                          {a.contact_name} · {a.contact_email}
                          {a.phone ? ` · ${a.phone}` : ""}
                        </div>
                        {a.description && (
                          <p className="mt-2 text-xs text-muted-foreground">{a.description}</p>
                        )}
                        {(() => {
                          const s = draftSummary(a);
                          return s ? (
                            <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                              wizard · {s}
                              {a.proposed_slug ? ` · /${a.proposed_slug}` : ""}
                            </div>
                          ) : null;
                        })()}
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
        )}

        {tab === "apps" && past.length > 0 && (
          <section className="mt-6">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("approved")} / {t("rejected")}
            </h2>
            <ul className="mt-2 space-y-1">
              {past.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between rounded-xl bg-muted/40 px-3 py-1.5 text-xs"
                >
                  <span className="truncate font-semibold">{a.business_name}</span>
                  <span className={a.status === "approved" ? "text-emerald-700" : "text-red-700"}>
                    {a.status === "approved" ? t("approved") : t("rejected")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === "vendors" && (
          <section className="mt-4">
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setCityFilter("")}
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${cityFilter === "" ? "bg-foreground text-background" : "bg-muted"}`}
              >
                {t("allCities")}
              </button>
              {cities.map((c) => (
                <button
                  key={c}
                  onClick={() => setCityFilter(c)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${cityFilter === c ? "bg-foreground text-background" : "bg-muted"}`}
                >
                  {c}
                </button>
              ))}
            </div>
            <ul className="mt-3 space-y-2">
              {filteredVendors.map((v) => (
                <li key={v.id} className="rounded-2xl border border-border bg-card p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 font-bold">
                        {v.brand_primary && (
                          <span
                            className="inline-block h-3 w-3 rounded-full"
                            style={{ backgroundColor: v.brand_primary }}
                          />
                        )}
                        <span>{v.name}</span>
                        {v.is_featured && (
                          <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold uppercase text-amber-800">
                            ★ {t("featured")}
                          </span>
                        )}
                        {!v.is_active && (
                          <span className="rounded-full bg-red-100 px-1.5 text-[10px] font-bold uppercase text-red-800">
                            off
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {v.cuisine} · /{v.slug} · ★ {v.rating ?? "—"} ({v.rating_count ?? 0})
                      </div>
                      <div className="mt-2 flex items-center gap-1.5">
                        <label className="text-[11px] font-semibold text-muted-foreground">
                          {t("city")}
                        </label>
                        <input
                          value={cityDraft[v.id] ?? ""}
                          onChange={(e) => setCityDraft({ ...cityDraft, [v.id]: e.target.value })}
                          placeholder="Amsterdam"
                          className="w-36 rounded-md border border-border bg-background px-2 py-0.5 text-xs"
                        />
                        <button
                          disabled={busyId === v.id || (cityDraft[v.id] ?? "") === (v.city ?? "")}
                          onClick={() => saveCity(v)}
                          className="rounded-full border border-border px-2 py-0.5 text-[11px] font-semibold disabled:opacity-40"
                        >
                          {t("saveCity")}
                        </button>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        disabled={busyId === v.id}
                        onClick={() => toggleFeatured(v)}
                        className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {v.is_featured ? t("unfeature") : t("feature")}
                      </button>
                      <button
                        disabled={busyId === v.id}
                        onClick={() => toggleActive(v)}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                      >
                        {v.is_active ? t("deactivate") : t("activate")}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === "reviews" && (
          <section className="mt-4">
            {reviews.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {t("noReviews")}
              </div>
            ) : (
              <ul className="space-y-2">
                {reviews.map((r) => (
                  <li
                    key={r.id}
                    className={`rounded-2xl border border-border bg-card p-3 ${r.is_hidden ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-bold">
                          <span>
                            {"★".repeat(r.rating)}
                            <span className="text-muted-foreground">
                              {"★".repeat(5 - r.rating)}
                            </span>
                          </span>
                          {r.vendors && <span>{r.vendors.name}</span>}
                          {r.is_hidden && (
                            <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold uppercase text-muted-foreground">
                              {t("hiddenReview")}
                            </span>
                          )}
                        </div>
                        {r.comment && (
                          <p className="mt-1 text-xs text-muted-foreground">{r.comment}</p>
                        )}
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          {new Date(r.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          disabled={busyId === r.id}
                          onClick={() => toggleHidden(r)}
                          className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
                        >
                          {r.is_hidden ? t("unhide") : t("hide")}
                        </button>
                        <button
                          disabled={busyId === r.id}
                          onClick={() => deleteReview(r)}
                          className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                        >
                          {t("delete")}
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
