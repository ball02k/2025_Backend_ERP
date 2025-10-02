// Centralised session for JWT + tenant
export type Session = { token?: string | null; tenant?: string | null; user?: any | null };
const LS_KEY = "session:v1";

export function getSession(): Session {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}") || {}; } catch { return {}; }
}
export function setSession(next: Session) {
  const curr = getSession();
  const merged = { ...curr, ...next };
  localStorage.setItem(LS_KEY, JSON.stringify(merged));
  cached = merged;
  // broadcast to other tabs
  window.dispatchEvent(new StorageEvent("storage", { key: LS_KEY, newValue: JSON.stringify(merged) } as any));
}
export function clearSession() {
  localStorage.removeItem(LS_KEY);
  // also clear any older keys used previously
  localStorage.removeItem("token");
  localStorage.removeItem("tenant");
  localStorage.removeItem("tenantId");
  cached = null;
  window.dispatchEvent(new StorageEvent("storage", { key: LS_KEY, newValue: null } as any));
}

let cached: Session | null = null;
export function getToken(): string | null { cached ||= getSession(); return (cached?.token as string) || null; }
export function getTenant(): string | null { cached ||= getSession(); return (cached?.tenant as string) || null; }

export function onSessionChange(cb: (s: Session) => void) {
  const h = (e: StorageEvent) => { if (e.key === LS_KEY) cb(getSession()); };
  window.addEventListener("storage", h);
  return () => window.removeEventListener("storage", h);
}

// React hook with "ready" flag
import { useEffect, useState } from "react";
export function useSession() {
  const [session, set] = useState<Session>(() => getSession());
  const [ready] = useState<boolean>(true); // we can set true now; add /me fetch later if needed

  useEffect(() => {
    const off = onSessionChange((s) => set(s));
    return () => off();
  }, []);
  return { session, ready };
}
