export function formatEUR(cents: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export function formatTime(hhmmss: string): string {
  // "14:15:00" -> "14:15"
  return hhmmss.slice(0, 5);
}

export function formatDate(iso: string, lang: "nl" | "en" = "nl"): string {
  return new Intl.DateTimeFormat(lang === "nl" ? "nl-NL" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(iso));
}
