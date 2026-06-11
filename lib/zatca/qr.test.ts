import { describe, expect, it } from "vitest";
import { buildZatcaTlvBase64, parseZatcaTlvBase64 } from "./qr";

describe("buildZatcaTlvBase64", () => {
  it("round-trips the five Phase-1 tags", () => {
    const b64 = buildZatcaTlvBase64({
      sellerName: "Bobs Records",
      vatNumber: "310122393500003",
      timestamp: "2022-04-25T15:30:00Z",
      total: 1000,
      vatAmount: 150,
    });
    const tags = parseZatcaTlvBase64(b64);
    expect(tags.get(1)).toBe("Bobs Records");
    expect(tags.get(2)).toBe("310122393500003");
    expect(tags.get(3)).toBe("2022-04-25T15:30:00Z");
    expect(tags.get(4)).toBe("1000.00");
    expect(tags.get(5)).toBe("150.00");
  });

  it("uses BYTE lengths for Arabic (multi-byte) seller names", () => {
    const name = "شركة أسس الإعمار المتقدمة";
    const b64 = buildZatcaTlvBase64({
      sellerName: name,
      vatNumber: "300000000000003",
      timestamp: "2026-06-11T12:00:00Z",
      total: 57500,
      vatAmount: 7500,
    });
    const buf = Buffer.from(b64, "base64");
    expect(buf[0]).toBe(1);
    expect(buf[1]).toBe(Buffer.byteLength(name, "utf8"));
    expect(parseZatcaTlvBase64(b64).get(1)).toBe(name);
    expect(parseZatcaTlvBase64(b64).get(4)).toBe("57500.00");
  });
});
