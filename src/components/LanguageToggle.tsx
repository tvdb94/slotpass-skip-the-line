import { useI18n } from "@/lib/i18n";

export function LanguageToggle() {
  const { lang, setLang } = useI18n();
  return (
    <div className="inline-flex rounded-full border border-border bg-background p-0.5 text-xs font-semibold">
      <button
        onClick={() => setLang("nl")}
        className={`px-3 py-1.5 rounded-full transition ${lang === "nl" ? "bg-foreground text-background" : "text-muted-foreground"}`}
      >
        NL
      </button>
      <button
        onClick={() => setLang("en")}
        className={`px-3 py-1.5 rounded-full transition ${lang === "en" ? "bg-foreground text-background" : "text-muted-foreground"}`}
      >
        EN
      </button>
    </div>
  );
}
