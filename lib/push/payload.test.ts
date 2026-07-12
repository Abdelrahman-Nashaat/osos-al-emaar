import { describe, it, expect } from "vitest";
import { buildPushPayload, isStaleStatus } from "@/lib/push/payload";

describe("buildPushPayload", () => {
  it("includes only title/body/href/tag — no extra fields", () => {
    const s = buildPushPayload({
      title: "أُسندت إليك مهمة",
      body: "تخطيط",
      href: "/tasks/1",
      type: "task_assigned",
    });
    const o = JSON.parse(s);
    expect(o).toEqual({
      title: "أُسندت إليك مهمة",
      body: "تخطيط",
      href: "/tasks/1",
      tag: "task_assigned",
    });
  });

  it("tolerates null body/href", () => {
    const o = JSON.parse(buildPushPayload({ title: "ت", body: null, href: null, type: "x" }));
    expect(o.body).toBe("");
    expect(o.href).toBe("/dashboard");
  });
});

describe("isStaleStatus", () => {
  it("treats 404 and 410 as stale", () => {
    expect(isStaleStatus(404)).toBe(true);
    expect(isStaleStatus(410)).toBe(true);
    expect(isStaleStatus(201)).toBe(false);
    expect(isStaleStatus(429)).toBe(false);
  });
});
