export type Rule =
  | { type: 'required'; message?: string }
  | { type: 'min'; value: number; message?: string }
  | { type: 'max'; value: number; message?: string }
  | { type: 'pattern'; value: RegExp; message?: string }
  | { type: 'email'; message?: string }
  | { type: 'date'; message?: string };

export type Rules = Record<string, Rule[]>;
export type Errors = Record<string, string>;

export function validate(values: Record<string, any>, rules: Rules): Errors {
  const errs: Errors = {};
  for (const [field, rs] of Object.entries(rules || {})) {
    const v = (values as any)[field];
    for (const r of rs) {
      if (r.type === 'required' && (v === null || v === undefined || v === '')) {
        errs[field] = r.message || 'This field is required'; break;
      }
      if (r.type === 'min' && v != null && Number(v) < r.value) {
        errs[field] = r.message || `Must be ≥ ${r.value}`; break;
      }
      if (r.type === 'max' && v != null && Number(v) > r.value) {
        errs[field] = r.message || `Must be ≤ ${r.value}`; break;
      }
      if (r.type === 'pattern' && v != null && !r.value.test(String(v))) {
        errs[field] = r.message || 'Invalid format'; break;
      }
      if (r.type === 'email' && v != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) {
        errs[field] = r.message || 'Invalid email'; break;
      }
      if (r.type === 'date' && v && Number.isNaN(new Date(v as any).getTime())) {
        errs[field] = r.message || 'Invalid date'; break;
      }
    }
  }
  return errs;
}

export function hasErrors(errs: Errors) {
  return Object.keys(errs).length > 0;
}

