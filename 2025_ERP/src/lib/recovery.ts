export function isRecoveryMode(): boolean {
  try {
    // Vite env toggle
    // @ts-ignore
    if ((import.meta as any)?.env?.VITE_RECOVERY_MODE === '1') return true;
  } catch {}
  try {
    return typeof window !== 'undefined' && localStorage.getItem('RECOVERY_MODE') === '1';
  } catch {
    return false;
  }
}

export function enableRecoveryMode() {
  try { if (typeof window !== 'undefined') localStorage.setItem('RECOVERY_MODE', '1'); } catch {}
}

export function disableRecoveryMode() {
  try { if (typeof window !== 'undefined') localStorage.removeItem('RECOVERY_MODE'); } catch {}
}

export function allFeaturesOn(): Record<string, boolean> {
  return {
    // core
    projects: true, suppliers: true, documents: true, tasks: true, reports: true,
    // add-ons
    finance: true, 'finance.po': true, 'finance.invoice': true, 'finance.ocr': true, 'finance.email_ingest': true,
    rfx: true, cvr: true, carbon: true, spm: true,
  } as Record<string, boolean>;
}

