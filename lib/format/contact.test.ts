import { describe, expect, it } from "vitest";
import { normalizeSaudiPhone } from "./contact";

describe("normalizeSaudiPhone", () => {
  it("converts a local 05 mobile to international form", () => {
    expect(normalizeSaudiPhone("0551234567")).toBe("+966551234567");
  });

  it("keeps an already-international number", () => {
    expect(normalizeSaudiPhone("+966551234567")).toBe("+966551234567");
  });

  it("adds + to a 966-prefixed number without it", () => {
    expect(normalizeSaudiPhone("966551234567")).toBe("+966551234567");
  });

  it("expands a bare 9-digit mobile starting with 5", () => {
    expect(normalizeSaudiPhone("551234567")).toBe("+966551234567");
  });

  it("strips spaces and dashes before normalizing", () => {
    expect(normalizeSaudiPhone("055-123 4567")).toBe("+966551234567");
  });

  it("returns null for empty/blank input", () => {
    expect(normalizeSaudiPhone("")).toBeNull();
    expect(normalizeSaudiPhone("   ")).toBeNull();
  });

  it("passes through a non-Saudi international number with its plus", () => {
    expect(normalizeSaudiPhone("+201001234567")).toBe("+201001234567");
  });
});
