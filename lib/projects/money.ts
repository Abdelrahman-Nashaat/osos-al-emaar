/**
 * Money formatting for the financial UI. Kept tiny and dependency-free.
 * Uses Latin digits + a trailing currency token, which reads cleanly under RTL
 * (e.g. "1,500,000 ر.س"). Only ever used in financials-gated surfaces.
 */
const CURRENCY_LABEL: Record<string, string> = {
  SAR: "ر.س",
};

export function formatMoney(value: number | null | undefined, currency = "SAR"): string {
  if (value == null) return "—";
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
  return `${n} ${CURRENCY_LABEL[currency] ?? currency}`;
}
