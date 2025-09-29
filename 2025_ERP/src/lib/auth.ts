export function isAuthed(): boolean {
  try {
    const t = localStorage.getItem("token");
    return !!t;
  } catch {
    return false;
  }
}
export function getToken(): string | null {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}
export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  } catch {}
}
export function getTenantId(): string | null {
  try {
    return localStorage.getItem("tenantId");
  } catch {
    return null;
  }
}
export function setTenantId(tenantId: string | null) {
  try {
    if (tenantId) localStorage.setItem("tenantId", tenantId);
    else localStorage.removeItem("tenantId");
  } catch {}
}

