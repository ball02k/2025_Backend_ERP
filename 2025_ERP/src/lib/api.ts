export type Query = Record<string, any>;

function qs(params?: Query) {
  if (!params) return '';
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    usp.append(k, String(v));
  });
  const s = usp.toString();
  return s ? `?${s}` : '';
}

function authHeaders(extra?: HeadersInit): HeadersInit {
  const h: Record<string, string> = {};
  const token = localStorage.getItem('token') || localStorage.getItem('authToken');
  const tenant = localStorage.getItem('tenantId') || 'demo';
  if (token) h['Authorization'] = `Bearer ${token}`;
  if (tenant) h['X-Tenant-Id'] = tenant;
  return { ...h, ...(extra || {}) };
}

export async function apiGet<T = any>(url: string, params?: Query): Promise<T> {
  const res = await fetch(`${url}${qs(params)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`GET ${url} ${res.status}`);
  return res.json();
}

export async function apiPost<T = any>(url: string, body?: any): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = isForm ? authHeaders() : authHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch(url, { method: 'POST', headers, body: isForm ? body : JSON.stringify(body || {}) });
  if (!res.ok) throw new Error(`POST ${url} ${res.status}`);
  return res.json();
}

export async function apiPatch<T = any>(url: string, body?: any): Promise<T> {
  const headers = authHeaders({ 'Content-Type': 'application/json' });
  const res = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify(body || {}) });
  if (!res.ok) throw new Error(`PATCH ${url} ${res.status}`);
  return res.json();
}

export async function apiDelete<T = any>(url: string): Promise<T> {
  const headers = authHeaders();
  const res = await fetch(url, { method: 'DELETE', headers });
  if (!res.ok) throw new Error(`DELETE ${url} ${res.status}`);
  try { return await res.json(); } catch { return undefined as any; }
}

