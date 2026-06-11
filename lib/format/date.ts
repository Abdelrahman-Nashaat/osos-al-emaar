/**
 * House date formatting — ONE Arabic-friendly style everywhere.
 * Gregorian calendar with Latin digits (the Phase 3 «ar-u-nu-latn» decision),
 * replacing the raw ISO strings that leaked into tables and detail pages.
 * Pure module (safe for client components and unit tests).
 */

const DATE_FMT = new Intl.DateTimeFormat("ar-u-nu-latn", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATE_LONG_FMT = new Intl.DateTimeFormat("ar-u-nu-latn", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const DATE_TIME_FMT = new Intl.DateTimeFormat("ar-u-nu-latn", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  // Date-only strings (YYYY-MM-DD) must not shift across timezones: pin to noon UTC.
  const d =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00Z`)
      : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** «11‏/06‏/2026» — compact, for table cells and field rows. */
export function formatDate(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? DATE_FMT.format(d) : "—";
}

/** «11 يونيو 2026» — for headers and print documents. */
export function formatDateLong(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? DATE_LONG_FMT.format(d) : "—";
}

/** «11‏/06‏/2026، 3:40 م» — for timelines and notifications. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  return d ? DATE_TIME_FMT.format(d) : "—";
}

/**
 * Client country display: ISO-2 codes become Arabic names («SA» → «السعودية»),
 * anything else (free text, global-ready) renders as typed.
 */
const REGION_NAMES = new Intl.DisplayNames(["ar"], { type: "region" });

export function countryLabel(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "—";
  if (/^[A-Za-z]{2}$/.test(v)) {
    try {
      const name = REGION_NAMES.of(v.toUpperCase());
      if (name && name !== v.toUpperCase()) return name;
    } catch {
      // fall through to raw value
    }
  }
  return v;
}
