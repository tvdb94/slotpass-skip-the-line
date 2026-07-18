import { Link } from "@tanstack/react-router";
import { LanguageToggle } from "./LanguageToggle";
import { useI18n } from "@/lib/i18n";

export function Header() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-foreground text-background font-black">S</div>
          <span className="text-lg font-black tracking-tight">{t("appName")}</span>
        </Link>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <Link
            to="/login"
            className="rounded-full bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background"
          >
            {t("signIn")}
          </Link>
        </div>
      </div>
    </header>
  );
}
