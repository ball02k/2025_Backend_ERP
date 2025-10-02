export function isDemo(): boolean {
  try { if ((import.meta as any)?.env?.VITE_DEMO_MODE === '1') return true; } catch {}
  try { return typeof window !== 'undefined' && localStorage.getItem('DEMO_MODE') === '1'; } catch {}
  return false;
}
export function enableDemo() { try { localStorage.setItem('DEMO_MODE', '1'); } catch {} location.reload(); }
export function disableDemo() { try { localStorage.removeItem('DEMO_MODE'); } catch {} location.reload(); }

