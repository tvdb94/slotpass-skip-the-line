// Guarded service worker registration. Never runs in dev or Lovable preview.
const SW_URL = "/sw.js";

function isPreviewHost(host: string): boolean {
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
}

async function unregisterOurWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
      if (url.endsWith("/sw.js")) await r.unregister();
    }
  } catch {
    // ignore
  }
}

export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const inIframe = window.self !== window.top;
  const url = new URL(window.location.href);
  const killSwitch = url.searchParams.get("sw") === "off";
  const host = window.location.hostname;
  const isDev = !import.meta.env.PROD;

  if (isDev || inIframe || isPreviewHost(host) || killSwitch) {
    await unregisterOurWorkers();
    return;
  }

  try {
    await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  } catch {
    // ignore registration errors
  }
}

// --- Offline order cache -------------------------------------------------
// Cache each viewed order in localStorage so the QR shows without a network.

const ORDER_KEY = (code: string) => `slotpass:order:${code.toUpperCase()}`;

export function cacheOrder(code: string, payload: unknown) {
  try {
    localStorage.setItem(
      ORDER_KEY(code),
      JSON.stringify({ cachedAt: Date.now(), payload }),
    );
  } catch {
    // ignore quota errors
  }
}

export function readCachedOrder<T = unknown>(code: string): { cachedAt: number; payload: T } | null {
  try {
    const raw = localStorage.getItem(ORDER_KEY(code));
    if (!raw) return null;
    return JSON.parse(raw) as { cachedAt: number; payload: T };
  } catch {
    return null;
  }
}

// --- Install prompt hook -------------------------------------------------

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l(true));
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((l) => l(false));
  });
}

export function subscribeInstallAvailability(cb: (available: boolean) => void): () => void {
  listeners.add(cb);
  cb(!!deferredPrompt);
  return () => listeners.delete(cb);
}

export async function triggerInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  listeners.forEach((l) => l(false));
  return choice.outcome === "accepted";
}