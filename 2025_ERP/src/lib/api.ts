// Unified API helpers for the ERP FE
// - Attaches JWT + X-Tenant-Id headers
// - Consistent error handling with 401 redirect (clears session)
// - Helpers: apiGet/Post/Put/Patch/Delete + apiUpload + apiCsvPost
// - Query-string builder with proper encoding
import { pushToast } from '@/components/Toaster';
import { getFinanceProjectId } from '@/lib/financeScope';
import { isDemo } from '@/lib/demo';
import { clearSession, getTenant, getToken } from '@/lib/auth';

export type Query = Record<string, any>;

function qs(query?: Query): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      v.forEach((vv) => parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(vv))}`));
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

// Headers helper using central session
function withAuthHeaders(init: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...init };
  const t = getToken();
  const tenant = getTenant();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  if (tenant && !headers['X-Tenant-Id']) headers['X-Tenant-Id'] = tenant;
  return headers;
}

function apiBase(): string {
  // Prefer VITE_API_BASE_URL; fallback to same-origin
  const b = (import.meta as any)?.env?.VITE_API_BASE_URL || "";
  return String(b || "").replace(/\/+$/, "");
}

let _handling401 = false;
function handle401() {
  if (_handling401) return;
  _handling401 = true;
  try { clearSession(); } catch {}
  const loc = window.location;
  const here = `${loc.pathname}${loc.search}${loc.hash}`;
  if (!/\/login/.test(loc.pathname)) {
    window.location.href = `/login?return=${encodeURIComponent(here)}`;
  }
}

async function handleResponse(resp: Response) {
  const contentType = resp.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await resp.json().catch(() => ({})) : await resp.text().catch(() => "");

  if (!resp.ok) {
    if (resp.status === 401) handle401();
    const errMsg =
      (isJson && (body?.error || body?.message)) ||
      (typeof body === "string" && body) ||
      `HTTP ${resp.status}`;
    const error = new Error(errMsg) as any;
    error.status = resp.status;
    error.body = body;
    if (isJson && body && typeof body === 'object' && (body as any).errors) {
      error.fieldErrors = (body as any).errors; // { field: message }
    }
    throw error;
  }
  return body;
}

type FetchOpts = {
  method?: string;
  query?: Query;
  headers?: Record<string, string>;
  body?: any;
  csv?: boolean; // when true, send as text/csv
  formData?: FormData; // when present, use multipart/form-data
  credentials?: RequestCredentials; // default include
};

async function apiFetch(path: string, opts: FetchOpts = {}) {
  const base = apiBase();
  // Auto-inject projectId for finance GET requests when a project scope is active
  let effectiveQuery = { ...(opts.query || {}) } as Record<string, any>;
  try {
    if (typeof path === 'string' && path.startsWith('/api/finance/') && (!effectiveQuery || effectiveQuery.projectId == null || effectiveQuery.projectId === '')) {
      const scopedId = getFinanceProjectId();
      if (Number.isFinite(Number(scopedId))) effectiveQuery.projectId = Number(scopedId);
    }
  } catch {}
  const url = `${base}${path}${qs(effectiveQuery)}`;
  const headers: Record<string, string> = withAuthHeaders({ ...(opts.headers || {}) });

  let body: BodyInit | undefined;
  if (opts.formData) {
    body = opts.formData; // browser sets boundary
  } else if (opts.csv) {
    headers["Content-Type"] = "text/csv";
    body = typeof opts.body === "string" ? opts.body : String(opts.body ?? "");
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  const resp = await fetch(url, {
    method: opts.method || "GET",
    headers,
    body,
    credentials: opts.credentials ?? "include",
  });

  return handleResponse(resp);
}

// Public helpers
export async function apiGet<T = any>(path: string, query?: Query): Promise<T> {
  return apiFetch(path, { method: "GET", query });
}
export async function apiPost<T = any>(path: string, body?: any, query?: Query): Promise<T> {
  const blockMsg = demoBlock(path, 'POST');
  if (blockMsg) { try { pushToast(blockMsg); } catch {} throw new Error(blockMsg); }
  return apiFetch(path, { method: "POST", body, query });
}
export async function apiPut<T = any>(path: string, body?: any, query?: Query): Promise<T> {
  const blockMsg = demoBlock(path, 'PUT');
  if (blockMsg) { try { pushToast(blockMsg); } catch {} throw new Error(blockMsg); }
  return apiFetch(path, { method: "PUT", body, query });
}
export async function apiPatch<T = any>(path: string, body?: any, query?: Query): Promise<T> {
  const blockMsg = demoBlock(path, 'PATCH');
  if (blockMsg) { try { pushToast(blockMsg); } catch {} throw new Error(blockMsg); }
  return apiFetch(path, { method: "PATCH", body, query });
}
export async function apiDelete<T = any>(path: string, query?: Query): Promise<T> {
  const blockMsg = demoBlock(path, 'DELETE');
  if (blockMsg) { try { pushToast(blockMsg); } catch {} throw new Error(blockMsg); }
  return apiFetch(path, { method: "DELETE", query });
}
export async function apiUpload<T = any>(path: string, formData: FormData, query?: Query): Promise<T> {
  return apiFetch(path, { method: "POST", formData, query });
}
export async function apiCsvPost<T = any>(path: string, csvText: string, query?: Query): Promise<T> {
  return apiFetch(path, { method: "POST", csv: true, body: csvText, query });
}

// Toast helpers (standardised)
export function toastOk(message: string) { try { pushToast(message, 'success'); } catch { console.log(message); } }
export function toastErr(e: any, fallback = 'Something went wrong') {
  const msg = e?.message || fallback;
  try { pushToast(msg, 'error'); } catch { console.error(msg); }
  // Preserve original error in console for debugging
  // eslint-disable-next-line no-console
  console.error(e);
}

// --- Demo guard ---
function demoBlock(path: string, method: string) {
  if (!isDemo()) return null;
  const m = method.toUpperCase();
  if (m === 'DELETE') return 'Delete is disabled in demo mode.';
  const protectedRe = /(users|tenants|auth|secrets|billing|plans)/i;
  if (m !== 'GET' && protectedRe.test(path)) return 'Changes to protected resources are disabled in demo mode.';
  return null;
}
