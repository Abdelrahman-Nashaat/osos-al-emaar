import { describe, it, expect } from "vitest";
import {
  isOverdue,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_BADGE,
} from "@/lib/projects/status";

// Fixed reference date for deterministic tests: 2026-06-07 (month is 0-indexed).
const TODAY = new Date(2026, 5, 7);

describe("isOverdue", () => {
  it("is true for a past due date on an open project", () => {
    expect(isOverdue("2026-06-01", "active", TODAY)).toBe(true);
    expect(isOverdue("2026-06-06", "planning", TODAY)).toBe(true);
    expect(isOverdue("2026-06-06", "on_hold", TODAY)).toBe(true);
  });

  it("is false when the project is completed or cancelled", () => {
    expect(isOverdue("2026-06-01", "completed", TODAY)).toBe(false);
    expect(isOverdue("2026-06-01", "cancelled", TODAY)).toBe(false);
  });

  it("is false when there is no due date", () => {
    expect(isOverdue(null, "active", TODAY)).toBe(false);
    expect(isOverdue(undefined, "active", TODAY)).toBe(false);
    expect(isOverdue("", "active", TODAY)).toBe(false);
  });

  it("is false for today or a future due date", () => {
    expect(isOverdue("2026-06-07", "active", TODAY)).toBe(false); // today
    expect(isOverdue("2026-12-31", "active", TODAY)).toBe(false); // future
  });

  it("ignores a time component on the date string", () => {
    expect(isOverdue("2026-06-01T15:30:00", "active", TODAY)).toBe(true);
  });
});

describe("status catalog", () => {
  it("has an Arabic label and badge class for every status", () => {
    for (const s of PROJECT_STATUSES) {
      expect(PROJECT_STATUS_LABELS[s]).toBeTruthy();
      expect(PROJECT_STATUS_BADGE[s]).toBeTruthy();
    }
  });
});
