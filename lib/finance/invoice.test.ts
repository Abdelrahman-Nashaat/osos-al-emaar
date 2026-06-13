import { describe, it, expect } from "vitest";
import { Constants } from "@/lib/supabase/database.types";
import {
  INVOICE_STATUSES,
  INVOICE_STATUS_LABELS,
  INVOICE_STATUS_BADGE,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  INVOICE_EVENT_LABELS,
  VAT_RATES,
  ISSUED_STATUSES,
  isInvoiceOverdue,
  isIssued,
  outstanding,
  agingBucket,
  daysOverdue,
  nextInvoiceActions,
} from "./invoice";

// Fixed "today" (noon UTC keeps the local Y-M-D stable across real timezones).
const NOW = new Date("2026-06-08T12:00:00Z");

describe("daysOverdue", () => {
  it("counts whole days past the due date", () => {
    expect(daysOverdue("2026-06-01", NOW)).toBe(7);
  });
  it("is 0 for a future due date", () => {
    expect(daysOverdue("2026-07-01", NOW)).toBe(0);
  });
  it("is 0 for today", () => {
    expect(daysOverdue("2026-06-08", NOW)).toBe(0);
  });
  it("is 0 when there is no due date", () => {
    expect(daysOverdue(null, NOW)).toBe(0);
    expect(daysOverdue(undefined, NOW)).toBe(0);
  });
});

describe("isInvoiceOverdue", () => {
  it("is overdue when due date is past and still awaiting collection", () => {
    expect(isInvoiceOverdue("2026-06-01", "sent", NOW)).toBe(true);
    expect(isInvoiceOverdue("2026-06-01", "partially_paid", NOW)).toBe(true);
  });

  it("is never overdue once settled (paid/void) or still a draft", () => {
    expect(isInvoiceOverdue("2026-06-01", "paid", NOW)).toBe(false);
    expect(isInvoiceOverdue("2026-06-01", "void", NOW)).toBe(false);
    expect(isInvoiceOverdue("2026-06-01", "draft", NOW)).toBe(false);
  });

  it("is not overdue for a future or missing due date", () => {
    expect(isInvoiceOverdue("2026-07-01", "sent", NOW)).toBe(false);
    expect(isInvoiceOverdue(null, "sent", NOW)).toBe(false);
    expect(isInvoiceOverdue(undefined, "partially_paid", NOW)).toBe(false);
  });
});

describe("isIssued (Phase 4.5 A1 — drafts/void never count as revenue)", () => {
  it("only sent/partially_paid/paid are issued receivables", () => {
    expect(isIssued("sent")).toBe(true);
    expect(isIssued("partially_paid")).toBe(true);
    expect(isIssued("paid")).toBe(true);
    expect(isIssued("draft")).toBe(false);
    expect(isIssued("void")).toBe(false);
  });

  it("ISSUED_STATUSES is exactly sent/partially_paid/paid and a subset of the DB enum", () => {
    expect([...ISSUED_STATUSES]).toEqual(["sent", "partially_paid", "paid"]);
    for (const s of ISSUED_STATUSES) {
      expect(Constants.public.Enums.invoice_status).toContain(s);
    }
  });
});

describe("outstanding", () => {
  it("returns total minus paid, clamped at zero", () => {
    expect(outstanding(1150, 0)).toBe(1150);
    expect(outstanding(1150, 500)).toBe(650);
    expect(outstanding(1150, 1150)).toBe(0);
    expect(outstanding(1150, 2000)).toBe(0);
  });

  it("avoids floating-point drift", () => {
    expect(outstanding(1150.1, 1000.05)).toBe(150.05);
  });
});

describe("agingBucket", () => {
  it("buckets by whole days past the due date", () => {
    expect(agingBucket(null, NOW)).toBe("current");
    expect(agingBucket("2026-07-01", NOW)).toBe("current"); // future
    expect(agingBucket("2026-06-08", NOW)).toBe("current"); // due today
    expect(agingBucket("2026-05-29", NOW)).toBe("d1_30"); // 10 days
    expect(agingBucket("2026-04-24", NOW)).toBe("d31_60"); // 45 days
    expect(agingBucket("2026-03-10", NOW)).toBe("d60_plus"); // 90 days
  });
});

describe("nextInvoiceActions", () => {
  it("a draft can be edited/sent; manager may also delete", () => {
    expect(nextInvoiceActions("draft", { isManager: false })).toEqual(["edit", "send", "note"]);
    expect(nextInvoiceActions("draft", { isManager: true })).toEqual([
      "edit",
      "send",
      "note",
      "void",
      "delete",
    ]);
  });

  it("a sent/partially_paid invoice can take a payment (accountant); manager may void", () => {
    expect(nextInvoiceActions("sent", { isManager: false })).toEqual(["record_payment", "note"]);
    expect(nextInvoiceActions("partially_paid", { isManager: false })).toEqual([
      "record_payment",
      "note",
    ]);
    expect(nextInvoiceActions("sent", { isManager: true })).toEqual([
      "record_payment",
      "note",
      "void",
    ]);
  });

  it("a paid invoice only takes a note (accountant) or a manager void; not delete", () => {
    expect(nextInvoiceActions("paid", { isManager: false })).toEqual(["note"]);
    expect(nextInvoiceActions("paid", { isManager: true })).toEqual(["note", "void"]);
  });

  it("a void invoice offers no actions", () => {
    expect(nextInvoiceActions("void", { isManager: false })).toEqual([]);
    expect(nextInvoiceActions("void", { isManager: true })).toEqual([]);
  });
});

describe("catalogs stay in sync with the DB enums", () => {
  it("invoice statuses match the enum and all have a label + badge", () => {
    expect([...INVOICE_STATUSES]).toEqual([...Constants.public.Enums.invoice_status]);
    for (const s of INVOICE_STATUSES) {
      expect(INVOICE_STATUS_LABELS[s]).toBeTruthy();
      expect(INVOICE_STATUS_BADGE[s]).toBeTruthy();
    }
  });

  it("payment methods match the enum and all have a label", () => {
    expect([...PAYMENT_METHODS]).toEqual([...Constants.public.Enums.payment_method]);
    for (const m of PAYMENT_METHODS) {
      expect(PAYMENT_METHOD_LABELS[m]).toBeTruthy();
    }
  });

  it("every invoice event type has a label", () => {
    for (const e of Constants.public.Enums.invoice_event_type) {
      expect(INVOICE_EVENT_LABELS[e]).toBeTruthy();
    }
  });

  it("VAT rates are exactly 0 and 15", () => {
    expect([...VAT_RATES]).toEqual([0, 15]);
  });
});
