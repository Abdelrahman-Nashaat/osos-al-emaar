import { describe, expect, it } from "vitest";
import {
  addMonths,
  daysInMonth,
  monthBounds,
  monthGrid,
  monthKey,
  parseMonthParam,
} from "./month";

describe("parseMonthParam", () => {
  const today = new Date("2026-06-11T10:00:00");
  it("accepts YYYY-MM", () => {
    expect(parseMonthParam("2026-07", today)).toEqual({ year: 2026, month: 7 });
  });
  it("falls back to the current month on junk", () => {
    expect(parseMonthParam("nope", today)).toEqual({ year: 2026, month: 6 });
    expect(parseMonthParam("2026-13", today)).toEqual({ year: 2026, month: 6 });
    expect(parseMonthParam(undefined, today)).toEqual({ year: 2026, month: 6 });
  });
});

describe("addMonths / monthKey", () => {
  it("wraps across years", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(monthKey({ year: 2026, month: 3 })).toBe("2026-03");
  });
});

describe("monthGrid", () => {
  it("covers June 2026 in full Sunday-first weeks", () => {
    const grid = monthGrid({ year: 2026, month: 6 });
    // June 1, 2026 is a Monday → the first week starts Sunday May 31.
    expect(grid[0][0].date).toBe("2026-05-31");
    expect(grid[0][0].inMonth).toBe(false);
    expect(grid[0][1].date).toBe("2026-06-01");
    expect(grid[0][1].inMonth).toBe(true);
    const flat = grid.flat();
    expect(flat.filter((c) => c.inMonth)).toHaveLength(30);
    expect(flat.length % 7).toBe(0);
  });

  it("monthBounds + daysInMonth agree (Feb leap)", () => {
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29);
    expect(monthBounds({ year: 2028, month: 2 })).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});
