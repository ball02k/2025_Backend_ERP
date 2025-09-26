// Unified API helpers for the ERP FE
// - Attaches JWT + X-Tenant-Id headers
// - Consistent error handling with 401 redirect
// - Helpers: apiGet/Post/Put/Patch/Delete + apiUpload + apiCsvPost
// - Query-string builder with proper encoding

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

// If you already have an auth module, prefer importing getToken/isAuthed/tenant getters.
// We keep a safe fallback to localStorage to avoid coupling.
function getToken(): string | null {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}
function getTenantId(): string | null {
  try {
    return localStorage.getItem("tenantId");
  } catch {
    return null;
  }
}

function apiBase(): string {
  // Prefer VITE_API_BASE_URL; fallback to same-origin
  const b = (import.meta as any)?.env?.VITE_API_BASE_URL || "";
  return String(b || "").replace(/\/+$/, "");
}

function loginRedirect() {
  const loc = window.location;
  const here = `${loc.pathname}${loc.search}${loc.hash}`;
  const url = `/login?return=${encodeURIComponent(here)}`;
  if (!/\/login/.test(loc.pathname)) {
    window.location.replace(url);
  }
}

async function handleResponse(resp: Response) {
  const contentType = resp.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const body = isJson ? await resp.json().catch(() => ({})) : await resp.text().catch(() => "");

  if (!resp.ok) {
    if (resp.status === 401) loginRedirect();
    const errMsg =
      (isJson && (body?.error || body?.message)) ||
      (typeof body === "string" && body) ||
      `HTTP ${resp.status}`;
    const error = new Error(errMsg) as any;
    error.status = resp.status;
    error.body = body;
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
  const url = `${base}${path}${qs(opts.query)}`;
  const token = getToken();
  const tenantId = getTenantId();

  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (tenantId) headers["X-Tenant-Id"] = tenantId;

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
  return apiFetch(path, { method: "POST", body, query });
}
export async function apiPut<T = any>(path: string, body?: any, query?: Query): Promise<T> {
  return apiFetch(path, { method: "PUT", body, query });
}
export async function apiPatch<T = any>(path: string, body?: any, query?: Query): Promise<T> {
  return apiFetch(path, { method: "PATCH", body, query });
}
export async function apiDelete<T = any>(path: string, query?: Query): Promise<T> {
  return apiFetch(path, { method: "DELETE", query });
}
export async function apiUpload<T = any>(path: string, formData: FormData, query?: Query): Promise<T> {
  return apiFetch(path, { method: "POST", formData, query });
}
export async function apiCsvPost<T = any>(path: string, csvText: string, query?: Query): Promise<T> {
  return apiFetch(path, { method: "POST", csv: true, body: csvText, query });
}
