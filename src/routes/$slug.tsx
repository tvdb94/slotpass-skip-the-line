import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { useI18n } from "@/lib/i18n";
import { useCart } from "@/lib/cart";
import { formatEUR, formatTime } from "@/lib/format";
import { StarRating } from "@/components/StarRating";

export const Route = createFileRoute("/$slug")({
  component: VendorPage,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Vendor not found</h1>
        <Link to="/" className="mt-4 inline-block text-sm font-semibold underline">
          Back to home
        </Link>
      </div>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div>
        <h1 className="text-lg font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Link to="/" className="mt-4 inline-block text-sm font-semibold underline">
          Back to home
        </Link>
      </div>
    </div>
  ),
});

type Vendor = {
  id: string; slug: string; name: string; cuisine: string; description: string | null;
  logo_url: string | null; hero_url: string | null; address: string | null;
  rating: number | null; rating_count: number | null; brand_primary: string | null; brand_secondary: string | null;
  service_fee_cents: number;
};
type Category = { id: string; name_nl: string; name_en: string; sort_order: number };
type MenuItem = {
  id: string; category_id: string | null; name_nl: string; name_en: string;
  description_nl: string | null; description_en: string | null;
  price_cents: number; image_url: string | null; is_available: boolean; sort_order: number;
  daily_stock: number | null; stock_remaining: number | null;
};

function VendorPage() {
  const { slug } = Route.useParams();
  const { t, lang } = useI18n();
  const { cart, addItem, totalCents, totalItems } = useCart();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const vendorQ = useQuery({
    queryKey: ["vendor", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data as Vendor;
    },
  });

  const vendor = vendorQ.data;

  const menuQ = useQuery({
    enabled: !!vendor,
    queryKey: ["menu", vendor?.id],
    queryFn: async () => {
      const [cats, items] = await Promise.all([
        supabase.from("categories").select("*").eq("vendor_id", vendor!.id).order("sort_order"),
        supabase.from("menu_items").select("*").eq("vendor_id", vendor!.id).eq("is_available", true).order("sort_order"),
      ]);
      if (cats.error) throw cats.error;
      if (items.error) throw items.error;
      return { categories: cats.data as Category[], items: items.data as MenuItem[] };
    },
  });

  // Realtime stock updates
  useEffect(() => {
    if (!vendor) return;
    const channel = supabase
      .channel(`menu-stock-${vendor.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "menu_items", filter: `vendor_id=eq.${vendor.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["menu", vendor.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [vendor, qc]);

  const reviewsQ = useQuery({
    enabled: !!vendor,
    queryKey: ["vendor-reviews", vendor?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("id,rating,comment,created_at")
        .eq("vendor_id", vendor!.id)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as { id: string; rating: number; comment: string | null; created_at: string }[];
    },
  });

  // Brand theming via CSS vars on this route
  useEffect(() => {
    if (!vendor) return;
    const root = document.documentElement;
    const prev = {
      primary: root.style.getPropertyValue("--brand-primary"),
      secondary: root.style.getPropertyValue("--brand-secondary"),
    };
    root.style.setProperty("--brand-primary", vendor.brand_primary ?? "#111111");
    root.style.setProperty("--brand-secondary", vendor.brand_secondary ?? "#333333");
    return () => {
      root.style.setProperty("--brand-primary", prev.primary);
      root.style.setProperty("--brand-secondary", prev.secondary);
    };
  }, [vendor]);

  const grouped = useMemo(() => {
    if (!menuQ.data) return [];
    const { categories, items } = menuQ.data;
    return categories.map((c) => ({
      cat: c,
      items: items.filter((i) => i.category_id === c.id),
    }));
  }, [menuQ.data]);

  if (vendorQ.isLoading || !vendor) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-3xl px-4 pt-6 text-sm text-muted-foreground">{t("loading")}</div>
      </div>
    );
  }

  const primary = vendor.brand_primary ?? "#111111";
  const cartVendorMatches = cart.vendor_id === vendor.id;

  return (
    <div className="min-h-screen bg-background pb-32">
      <Header />

      {/* Hero */}
      <div
        className="relative h-52 w-full overflow-hidden"
        style={{ background: `linear-gradient(180deg, ${primary}22 0%, ${primary}00 100%)` }}
      >
        {vendor.hero_url && (
          <img src={vendor.hero_url} alt={vendor.name} className="h-full w-full object-cover" />
        )}
      </div>

      <div className="mx-auto max-w-3xl px-4">
        <div className="-mt-8 flex items-end gap-3">
          {vendor.logo_url && (
            <img
              src={vendor.logo_url}
              alt=""
              className="h-16 w-16 shrink-0 rounded-2xl object-cover ring-4 ring-background"
              style={{ borderColor: primary }}
            />
          )}
          <div className="min-w-0 pb-1">
            <h1 className="truncate text-2xl font-black leading-tight" style={{ color: primary }}>
              {vendor.name}
            </h1>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">
              {vendor.cuisine} · ★ {vendor.rating?.toFixed(1)} · {vendor.address}
            </div>
          </div>
        </div>

        {vendor.description && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{vendor.description}</p>
        )}

        {/* Reviews */}
        <section className="mt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("reviews")}</h2>
            {vendor.rating_count ? (
              <div className="text-xs text-muted-foreground">
                ★ {vendor.rating?.toFixed(1)} · {t("basedOn")} {vendor.rating_count} {t("reviewsCount")}
              </div>
            ) : null}
          </div>
          {reviewsQ.data && reviewsQ.data.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {reviewsQ.data.map((r) => (
                <li key={r.id} className="rounded-2xl border border-border bg-card p-3">
                  <StarRating value={r.rating} size={16} readOnly />
                  {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {new Intl.DateTimeFormat(lang === "nl" ? "nl-NL" : "en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    }).format(new Date(r.created_at))}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">{t("noReviewsYet")}</p>
          )}
        </section>

        {/* Menu */}
        <section className="mt-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("menu")}</h2>
          {menuQ.isLoading ? (
            <div className="mt-3 text-sm text-muted-foreground">{t("loading")}</div>
          ) : (
            <div className="mt-3 space-y-6">
              {grouped.map(({ cat, items }) => (
                <div key={cat.id}>
                  <h3 className="text-sm font-bold" style={{ color: primary }}>
                    {lang === "nl" ? cat.name_nl : cat.name_en}
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {items.map((item) => {
                      const name = lang === "nl" ? item.name_nl : item.name_en;
                      const desc = lang === "nl" ? item.description_nl : item.description_en;
                      const isStocked = item.daily_stock != null;
                      const remaining = item.stock_remaining ?? 0;
                      const soldOut = isStocked && remaining <= 0;
                      return (
                        <li
                          key={item.id}
                          className={`flex gap-3 rounded-2xl border border-border bg-card p-3 ${soldOut ? "opacity-60" : ""}`}
                        >
                          {item.image_url && (
                            <img src={item.image_url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start gap-2">
                              <h4 className="min-w-0 flex-1 truncate text-sm font-bold">{name}</h4>
                              <span className="shrink-0 text-sm font-bold" style={{ color: primary }}>
                                {formatEUR(item.price_cents)}
                              </span>
                            </div>
                            {desc && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{desc}</p>}
                            {isStocked && (
                              <div className="mt-1 text-[11px] font-bold">
                                {soldOut ? (
                                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                                    {lang === "nl" ? "Uitverkocht" : "Sold out"}
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                                    {remaining} {lang === "nl" ? "over vandaag" : "left today"}
                                  </span>
                                )}
                              </div>
                            )}
                            <button
                              disabled={soldOut}
                              onClick={() =>
                                addItem(
                                  { id: vendor.id, slug: vendor.slug },
                                  {
                                    menu_item_id: item.id,
                                    name,
                                    price_cents: item.price_cents,
                                    image_url: item.image_url,
                                  },
                                )
                              }
                              className="mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                              style={{ background: primary }}
                            >
                              + {t("addToCart")}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Sticky cart bar */}
      {cartVendorMatches && totalItems > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 p-3 backdrop-blur">
          <button
            onClick={() => navigate({ to: "/checkout" })}
            className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-xl px-4 py-3 text-white shadow-lg"
            style={{ background: primary }}
          >
            <span className="flex items-center gap-2 text-sm font-bold">
              <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">{totalItems}</span>
              {t("checkout")}
            </span>
            <span className="text-sm font-black">{formatEUR(totalCents)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// silence for future use
void formatTime;