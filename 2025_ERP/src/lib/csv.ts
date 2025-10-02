import { pushToast } from '@/components/Toaster';
export function toastCsvResult({ imported = 0, skipped = 0, failed = 0 } = {}) {
  const bits: string[] = [];
  if (imported) bits.push(`${imported} imported`);
  if (skipped) bits.push(`${skipped} skipped`);
  if (failed) bits.push(`${failed} failed`);
  try { pushToast(bits.length ? `CSV: ${bits.join(', ')}` : 'CSV processed'); }
  catch { console.log(bits.length ? `CSV: ${bits.join(', ')}` : 'CSV processed'); }
}

