/**
 * Pure month-grid helpers for «التقويم». Saudi week: Sunday-first, weekend
 * Friday+Saturday. All dates are local-date strings (YYYY-MM-DD) — no TZ math.
 */

export type MonthRef = { year: number; month: number }; // month: 1–12

export function parseMonthParam(v: string | undefined, today = new Date()): MonthRef {
  const m = /^(\d{4})-(\d{2})$/.exec(v ?? "");
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  }
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
}

export function monthKey(ref: MonthRef): string {
  return `${ref.year}-${String(ref.month).padStart(2, "0")}`;
}

export function addMonths(ref: MonthRef, delta: number): MonthRef {
  const i = ref.year * 12 + (ref.month - 1) + delta;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
}

export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonth(ref: MonthRef): number {
  return new Date(ref.year, ref.month, 0).getDate();
}

/** First/last day of the month as YYYY-MM-DD (inclusive bounds for queries). */
export function monthBounds(ref: MonthRef): { from: string; to: string } {
  return {
    from: isoDate(ref.year, ref.month, 1),
    to: isoDate(ref.year, ref.month, daysInMonth(ref)),
  };
}

export type MonthCell = { date: string; day: number; inMonth: boolean };

/**
 * Full weeks covering the month, Sunday-first. Leading/trailing cells come from
 * the neighbour months (inMonth=false).
 */
export function monthGrid(ref: MonthRef): MonthCell[][] {
  const first = new Date(ref.year, ref.month - 1, 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay()); // back to Sunday

  const weeks: MonthCell[][] = [];
  const cursor = new Date(start);
  do {
    const week: MonthCell[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({
        date: isoDate(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate()),
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === ref.month - 1,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  } while (cursor.getMonth() === ref.month - 1);
  return weeks;
}

export const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export function monthTitle(ref: MonthRef): string {
  return `${MONTHS_AR[ref.month - 1]} ${ref.year}`;
}

export function todayIso(today = new Date()): string {
  return isoDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
}
