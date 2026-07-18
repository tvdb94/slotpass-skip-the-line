import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "nl" | "en";

const dict = {
  nl: {
    appName: "SlotPass",
    tagline: "Bestel vooruit. Sla de rij over.",
    signIn: "Inloggen",
    signOut: "Uitloggen",
    demoCustomer: "Demo klant",
    demoVendor: "Demo verkoper",
    demoLoginTitle: "Kies je demo login",
    demoLoginSubtitle: "SlotPass werkt met twee demo accounts.",
    customer: "Klant",
    vendor: "Verkoper",
    customerBlurb: "Ontdek zaken, bestel vooruit en pick-up met QR.",
    vendorBlurb: "Open het dashboard en beheer je zaak.",
    browseWithoutLogin: "Verder zonder inloggen",
    currentLocation: "Amsterdam Centrum",
    changeLocation: "Wijzig",
    list: "Lijst",
    map: "Kaart",
    featured: "Uitgelicht",
    categories: "Categorieën",
    all: "Alle",
    nearby: "In de buurt",
    nextSlot: "Volgende slot",
    noVendors: "Geen zaken gevonden.",
    discount: "korting",
    offPeak: "Off-peak",
    orderAhead: "Bestel vooruit, sla de rij over",
    loading: "Laden…",
  },
  en: {
    appName: "SlotPass",
    tagline: "Order ahead. Skip the line.",
    signIn: "Sign in",
    signOut: "Sign out",
    demoCustomer: "Demo customer",
    demoVendor: "Demo vendor",
    demoLoginTitle: "Pick your demo login",
    demoLoginSubtitle: "SlotPass ships with two demo accounts.",
    customer: "Customer",
    vendor: "Vendor",
    customerBlurb: "Discover vendors, pre-order, and pick up with a QR.",
    vendorBlurb: "Open the dashboard and manage your store.",
    browseWithoutLogin: "Continue without signing in",
    currentLocation: "Amsterdam Center",
    changeLocation: "Change",
    list: "List",
    map: "Map",
    featured: "Featured",
    categories: "Categories",
    all: "All",
    nearby: "Nearby",
    nextSlot: "Next slot",
    noVendors: "No vendors found.",
    discount: "off",
    offPeak: "Off-peak",
    orderAhead: "Order ahead, skip the line",
    loading: "Loading…",
  },
} as const;

type Key = keyof (typeof dict)["nl"];

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: Key) => string }>({
  lang: "nl",
  setLang: () => {},
  t: (k) => String(k),
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("nl");
  useEffect(() => {
    const stored = typeof window !== "undefined" ? (localStorage.getItem("slotpass.lang") as Lang | null) : null;
    if (stored === "nl" || stored === "en") setLangState(stored);
  }, []);
  const setLang = (l: Lang) => {
    setLangState(l);
    if (typeof window !== "undefined") localStorage.setItem("slotpass.lang", l);
  };
  const t = (k: Key) => dict[lang][k];
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
