import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LanguageToggle } from "./LanguageToggle";
import { useI18n } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";

export function Header() {
  const { t } = useI18n();
  const [isStaff, setIsStaff] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let cancel = false;
    const check = async () => {
      const { data } = await supabase.auth.getUser();
      if (cancel) return;
      const u = data.user;
      setSignedIn(!!u);
      if (!u) { setIsStaff(false); return; }
      const { data: s } = await supabase.from("staff").select("vendor_id").eq("auth_user_id", u.id).maybeSingle();
      if (!cancel) setIsStaff(!!s);
    };
    check();
    const { data: sub } = supabase.auth.onAuthStateChange(() => check());
    return () => { cancel = true; sub.subscription.unsubscribe(); };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-foreground text-background font-black">S</div>
          <span className="text-lg font-black tracking-tight">{t("appName")}</span>
        </Link>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          {isStaff && (
            <Link
              to="/vendor"
              className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold"
            >
              {t("dashboard")}
            </Link>
          )}
          {signedIn && !isStaff && (
            <Link
              to="/orders"
              className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold"
            >
              {t("myOrders")}
            </Link>
          )}
          {signedIn ? (
            <button
              onClick={signOut}
              className="rounded-full bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background"
            >
              {t("signOut")}
            </button>
          ) : (
            <Link
              to="/login"
              className="rounded-full bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background"
            >
              {t("signIn")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
