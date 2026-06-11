import { describe, expect, it } from "vitest";
import { countryLabel, formatDate, formatDateLong, formatDateTime } from "./date";

describe("formatDate family", () => {
  it("formats a date-only string with Latin digits, Gregorian, no TZ shift", () => {
    const s = formatDate("2026-06-20");
    expect(s).toContain("20");
    expect(s).toContain("06");
    expect(s).toContain("2026");
    // Never Arabic-Indic digits (house rule ar-u-nu-latn)
    expect(s).not.toMatch(/[٠-٩]/);
  });

  it("formats long Arabic month names", () => {
    expect(formatDateLong("2026-06-20")).toContain("يونيو");
  });

  it("formats timestamps with a time part", () => {
    const s = formatDateTime("2026-06-11T12:30:00Z");
    expect(s).toContain("2026");
    expect(s).toMatch(/[:\d]/);
  });

  it("returns — for null/invalid input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
  });
});

describe("countryLabel", () => {
  it("maps ISO-2 codes to Arabic names", () => {
    expect(countryLabel("SA")).toContain("السعودية");
    expect(countryLabel("sa")).toContain("السعودية");
    expect(countryLabel("AE")).toContain("الإمارات");
  });

  it("passes through free text and empties", () => {
    expect(countryLabel("الإمارات العربية المتحدة")).toBe("الإمارات العربية المتحدة");
    expect(countryLabel("")).toBe("—");
    expect(countryLabel(null)).toBe("—");
  });
});
