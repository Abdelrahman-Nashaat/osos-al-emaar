import { describe, expect, it } from "vitest";
import { isOfferStale, nextOfferActions } from "./offer";

describe("nextOfferActions", () => {
  it("draft: edit/send for editors, +delete for manager", () => {
    expect(nextOfferActions("draft", { isManager: false, canEdit: true, converted: false }))
      .toEqual(["edit", "send", "note"]);
    expect(nextOfferActions("draft", { isManager: true, canEdit: true, converted: false }))
      .toEqual(["edit", "send", "note", "delete"]);
  });

  it("sent: decisions for editors only", () => {
    expect(nextOfferActions("sent", { isManager: false, canEdit: false, converted: false }))
      .toEqual(["note"]);
    expect(nextOfferActions("sent", { isManager: true, canEdit: true, converted: false }))
      .toEqual(["accept", "reject", "expire", "note"]);
  });

  it("accepted: convert only for manager and only once", () => {
    expect(nextOfferActions("accepted", { isManager: true, canEdit: true, converted: false }))
      .toEqual(["convert", "note"]);
    expect(nextOfferActions("accepted", { isManager: true, canEdit: true, converted: true }))
      .toEqual(["note"]);
    expect(nextOfferActions("accepted", { isManager: false, canEdit: false, converted: false }))
      .toEqual(["note"]);
  });

  it("terminal states keep only note", () => {
    expect(nextOfferActions("rejected", { isManager: true, canEdit: true, converted: false }))
      .toEqual(["note"]);
    expect(nextOfferActions("expired", { isManager: true, canEdit: true, converted: false }))
      .toEqual(["note"]);
  });
});

describe("isOfferStale", () => {
  const today = new Date("2026-06-11T10:00:00");
  it("flags sent offers past validity", () => {
    expect(isOfferStale("sent", "2026-06-10", today)).toBe(true);
    expect(isOfferStale("sent", "2026-06-11", today)).toBe(false);
    expect(isOfferStale("sent", null, today)).toBe(false);
  });
  it("never flags non-sent statuses", () => {
    expect(isOfferStale("draft", "2026-06-01", today)).toBe(false);
    expect(isOfferStale("accepted", "2026-06-01", today)).toBe(false);
  });
});
