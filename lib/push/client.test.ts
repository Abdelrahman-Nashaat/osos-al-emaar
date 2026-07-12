import { describe, it, expect } from "vitest";
import { urlBase64ToUint8Array } from "@/lib/push/client";

describe("urlBase64ToUint8Array", () => {
  it("decodes a VAPID base64url key to bytes", () => {
    const out = urlBase64ToUint8Array("BFxx-Ab0");
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out.length).toBeGreaterThan(0);
  });

  it("handles url-safe chars and missing padding without throwing", () => {
    expect(() => urlBase64ToUint8Array("a-_b")).not.toThrow();
  });

  it("round-trips a known base64url value to the right byte length", () => {
    // "AQID" (standard b64) decodes to bytes [1,2,3].
    const out = urlBase64ToUint8Array("AQID");
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });
});
