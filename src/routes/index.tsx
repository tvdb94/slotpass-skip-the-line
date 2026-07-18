import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { formatTime, formatEUR } from "@/lib/format";
import { ClientMap } from "@/components/ClientMap";

export const Route = createFileRoute("/")({
  component: Index,
});

type Vendor = {
  id: string; slug: string; name: string; cuisine: string; description: string | null;
  logo_url: string | null; hero_url: string | null; address: string | null;
  lat: number | null; lng: number | null; rating: number | null;
  brand_primary: string | null; brand_secondary: string | null;
  is_featured: boolean; featured_headline_nl: string | null; featured_headline_en: string | null;
};
type Slot = { vendor_id: string; date: string; start_time: string; end_time: string; capacity: number; orders_count: number; discount_pct: number; is_open: boolean };

function Index() {
  const { t, lang } = useI18n();
  const [view, setView] = useState<"list" | "map">("list");
  const [cuisine, setCuisine] = useState<string | "all">("all");

  const vendorsQ = useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").eq("is_active", true).order("is_featured", { ascending: false });
      if (error) throw error;
      return data as Vendor[];
    },
  });

  const slotsQ = useQuery({
    queryKey: ["slots-today"],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("slots")
        .select("vendor_id,date,start_time,end_time,capacity,orders_count,discount_pct,is_open")
        .gte("date", today)
        .eq("is_open", true)
        .order("date", { ascending: true })
        .order("start_time", { ascending: true });
      if (error) throw error;
      return data as Slot[];
    },
  });

  const vendors = vendorsQ.data ?? [];
  const slots = slotsQ.data ?? [];

  const cuisines = useMemo(() => Array.from(new Set(vendors.map((v) => v.cuisine))), [vendors]);
  const filtered = cuisine === "all" ? vendors : vendors.filter((v) => v.cuisine === cuisine);
  const featured = vendors.filter((v) => v.is_featured);

  // Promo carousel: auto-advance + dot indicators
  const carouselRef = useRef<HTMLDivElement>(null);
  const [activePromo, setActivePromo] = useState(0);
  useEffect(() => {
    if (featured.length <= 1) return;
    const id = setInterval(() => {
      setActivePromo((i) => {
        const next = (i + 1) % featured.length;
        const el = carouselRef.current;
        if (el) {
          const card = el.children[next] as HTMLElement | undefined;
          card?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
        }
        return next;
      });
    }, 5000);
    return () => clearInterval(id);
  }, [featured.length]);
  function onCarouselScroll() {
    const el = carouselRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / (el.clientWidth * 0.85));
    if (idx !== activePromo) setActivePromo(Math.min(idx, featured.length - 1));
  }

  // per-vendor next available slot + max discount today
  const meta = useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const today = now.toISOString().slice(0, 10);
    const m = new Map<string, { next?: Slot; maxDiscount: number }>();
    for (const s of slots) {
      const capOk = s.orders_count < s.capacity;
      if (!capOk) continue;
      const stMin = Number(s.start_time.slice(0, 2)) * 60 + Number(s.start_time.slice(3, 5));
      const future = s.date > today || (s.date === today && stMin > nowMin);
      if (!future) continue;
      const cur = m.get(s.vendor_id) ?? { maxDiscount: 0 };
      if (!cur.next) cur.next = s;
      if (s.discount_pct > cur.maxDiscount) cur.maxDiscount = s.discount_pct;
      m.set(s.vendor_id, cur);
    }
    return m;
  }, [slots]);

  return (
    <div className="min-h-screen bg-background pb-10">
      <Header />

      {/* Location bar */}
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 pt-4">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">📍 {lang === "nl" ? "Bezorging bij" : "Pickup near"}</div>
          <button className="mt-0.5 flex items-center gap-1.5 text-left">
            <span className="truncate text-base font-bold">{t("currentLocation")}</span>
            <span className="text-xs font-semibold text-muted-foreground underline">{t("changeLocation")}</span>
          </button>
        </div>
        <div className="inline-flex shrink-0 overflow-hidden rounded-full border border-border bg-background p-0.5 text-xs font-semibold">
          <button
            onClick={() => setView("list")}
            className={`px-3 py-1.5 rounded-full transition ${view === "list" ? "bg-foreground text-background" : "text-muted-foreground"}`}
          >
            {t("list")}
          </button>
          <button
            onClick={() => setView("map")}
            className={`px-3 py-1.5 rounded-full transition ${view === "map" ? "bg-foreground text-background" : "text-muted-foreground"}`}
          >
            {t("map")}
          </button>
        </div>
      </div>

      {view === "map" ? (
        <div className="mx-auto mt-4 h-[70vh] max-w-3xl overflow-hidden rounded-2xl border border-border">
          <ClientMap vendors={vendors.map((v) => ({ id: v.id, slug: v.slug, name: v.name, cuisine: v.cuisine, lat: v.lat, lng: v.lng, brand_primary: v.brand_primary }))} />
        </div>
      ) : (
        <>
          {/* Promo carousel */}
          {featured.length > 0 && (
            <section className="mt-5">
              <h2 className="mx-auto max-w-3xl px-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t("featured")}
              </h2>
              <div
                ref={carouselRef}
                onScroll={onCarouselScroll}
                className="mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {featured.map((v) => {
                  const headline = (lang === "nl" ? v.featured_headline_nl : v.featured_headline_en) ?? "";
                  return (
                    <a
                      key={v.id}
                      href={`/${v.slug}`}
                      className="relative flex min-w-[85%] snap-start overflow-hidden rounded-2xl p-5 text-white shadow-lg transition hover:shadow-xl animate-fade-in"
                      style={{ background: `linear-gradient(135deg, ${v.brand_primary ?? "#111"} 0%, ${v.brand_primary ?? "#111"}dd 100%)` }}
                    >
                      <div className="flex-1">
                        <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">{v.cuisine}</div>
                        <div className="mt-1 text-xl font-black leading-tight">{v.name}</div>
                        <div className="mt-2 text-sm font-medium leading-snug">{headline}</div>
                        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-bold backdrop-blur">
                          {t("orderAhead")} →
                        </div>
                      </div>
                      {v.logo_url && (
                        <img src={v.logo_url} alt="" className="ml-3 h-20 w-20 shrink-0 rounded-2xl object-cover ring-2 ring-white/40" />
                      )}
                    </a>
                  );
                })}
              </div>
              {featured.length > 1 && (
                <div className="mx-auto mt-2 flex max-w-3xl justify-center gap-1.5 px-4">
                  {featured.map((_, i) => (
                    <span
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${i === activePromo ? "w-6 bg-foreground" : "w-1.5 bg-muted-foreground/30"}`}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Cuisine chips */}
          <section className="mt-4">
            <div className="flex gap-2 overflow-x-auto px-4 pb-1">
              <Chip active={cuisine === "all"} onClick={() => setCuisine("all")}>{t("all")}</Chip>
              {cuisines.map((c) => (
                <Chip key={c} active={cuisine === c} onClick={() => setCuisine(c)}>{c}</Chip>
              ))}
            </div>
          </section>

          {/* Vendor list */}
          <section className="mx-auto mt-5 max-w-3xl px-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("nearby")}</h2>
            {vendorsQ.isLoading ? (
              <ul className="mt-3 space-y-3">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
                    <div className="h-24 w-24 shrink-0 animate-pulse rounded-xl bg-muted" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                      <div className="h-5 w-24 animate-pulse rounded-full bg-muted" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : filtered.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                <div className="text-3xl">🍽️</div>
                <div className="mt-2 font-semibold text-foreground">{t("noVendors")}</div>
                {cuisine !== "all" && (
                  <button
                    onClick={() => setCuisine("all")}
                    className="mt-3 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold"
                  >
                    {t("all")}
                  </button>
                )}
              </div>
            ) : (
              <ul className="mt-3 space-y-3">
                {filtered.map((v) => {
                  const m = meta.get(v.id);
                  return (
                    <li key={v.id} className="animate-fade-in">
                      <a
                        href={`/${v.slug}`}
                        className="flex gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-foreground/40 hover:shadow-md active:scale-[.99]"
                      >
                        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
                          {v.hero_url && <img src={v.hero_url} alt={v.name} className="h-full w-full object-cover" />}
                          {m && m.maxDiscount > 0 && (
                            <span className="absolute left-1.5 top-1.5 rounded-md bg-foreground px-1.5 py-0.5 text-[10px] font-black text-background">
                              −{m.maxDiscount}%
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate text-base font-bold" style={{ color: v.brand_primary ?? undefined }}>{v.name}</h3>
                            <span className="ml-auto shrink-0 text-xs font-semibold">★ {v.rating?.toFixed(1)}</span>
                          </div>
                          <div className="mt-0.5 truncate text-xs text-muted-foreground">{v.cuisine} · {v.address}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {m?.next ? (
                              <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                                {t("nextSlot")}: {formatTime(m.next.start_time)}
                              </span>
                            ) : (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                                {lang === "nl" ? "Geen slots" : "No slots"}
                              </span>
                            )}
                            {m && m.maxDiscount > 0 && (
                              <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-bold text-background">
                                {t("offPeak")} −{m.maxDiscount}%
                              </span>
                            )}
                          </div>
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
        active ? "border-foreground bg-foreground text-background" : "border-border bg-background text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

// Silence unused import warning for formatEUR — used in later steps.
void formatEUR;
