export const toGBP = (n?: number | string | null) =>
  n == null || isNaN(Number(n)) ? "—" : Number(n).toLocaleString("en-GB", { style: "currency", currency: "GBP" });

export const toDateGB = (iso?: string | Date | null) =>
  !iso ? "—" : new Date(iso as any).toLocaleDateString("en-GB");

export const toPct = (num?: number | null, dp = 1) =>
  num == null || isNaN(Number(num)) ? "—" : `${Number(num).toFixed(dp)}%`;

