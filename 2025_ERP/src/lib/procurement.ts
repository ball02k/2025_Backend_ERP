import { apiGet, apiPost } from './api';

type MeResponse = { user?: { id?: number; role?: string; roles?: string[]; perms?: string[] } };

let cachedPerms: Set<string> | null = null;

async function loadPerms(): Promise<Set<string>> {
  if (cachedPerms) return cachedPerms;
  try {
    const res = (await apiGet<MeResponse>('/api/me')) || {};
    const roles = Array.isArray(res.user?.roles) ? res.user!.roles! : res.user?.role ? [res.user.role] : [];
    const perms = new Set<string>(Array.isArray(res.user?.perms) ? res.user!.perms! : []);
    // Admin implies wildcard
    if (roles.includes('admin')) perms.add('*');
    cachedPerms = perms;
    return perms;
  } catch {
    // On failure, assume no permissions
    cachedPerms = new Set();
    return cachedPerms;
  }
}

export async function hasPermission(perm: string): Promise<boolean> {
  const perms = await loadPerms();
  return perms.has('*') || perms.has(perm);
}

export async function hasAwardPermission(): Promise<boolean> {
  return hasPermission('procurement:award');
}

export type AwardResult = { data: { winner: any } };

export async function awardRequest(requestId: number | string, supplierId: number | string, reason?: string): Promise<AwardResult> {
  // Pre-check permission to avoid a failing call and show clearer UI state
  const allowed = await hasAwardPermission();
  if (!allowed) {
    const err: any = new Error('Missing permission: procurement:award');
    err.status = 403;
    err.body = { error: { code: 'FORBIDDEN', message: 'Missing permission: procurement:award' } };
    throw err;
  }

  try {
    return await apiPost<AwardResult>(`/api/requests/${requestId}/award`, { supplierId, ...(reason ? { reason } : {}) });
  } catch (e: any) {
    // Normalize FORBIDDEN shape for consumers
    if (e?.status === 403 && e?.body?.error?.code === 'FORBIDDEN') {
      const err: any = new Error(e.body.error.message || 'Forbidden');
      err.status = 403;
      err.body = e.body;
      throw err;
    }
    throw e;
  }
}

// New: tender award helper mirroring request award semantics
export async function awardTender(tenderId: number | string, body: { responseId: number|string; contractRef?: string; startDate?: string; endDate?: string }) {
  const allowed = await hasAwardPermission();
  if (!allowed) {
    const err: any = new Error('Missing permission: procurement:award');
    err.status = 403;
    err.body = { error: { code: 'FORBIDDEN', message: 'Missing permission: procurement:award' } };
    throw err;
  }
  try {
    return await apiPost(`/api/tenders/${tenderId}/award`, body);
  } catch (e: any) {
    if (e?.status === 403 && e?.body?.error?.code === 'FORBIDDEN') {
      const err: any = new Error(e.body.error.message || 'Forbidden');
      err.status = 403;
      err.body = e.body;
      throw err;
    }
    throw e;
  }
}
