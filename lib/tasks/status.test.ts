import { describe, it, expect } from "vitest";
import { Constants } from "@/lib/supabase/database.types";
import {
  canTransition,
  isTaskOverdue,
  nextActions,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  TASK_STATUS_BADGE,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITY_BADGE,
  TASK_EVENT_LABELS,
} from "@/lib/tasks/status";

// Fixed reference instant for deterministic overdue tests.
const NOW = new Date("2026-06-07T12:00:00Z");

describe("canTransition (mirror of the DB state machine)", () => {
  it("allows the legal moves", () => {
    expect(canTransition("new", "assigned")).toBe(true);
    expect(canTransition("assigned", "in_progress")).toBe(true);
    expect(canTransition("assigned", "assigned")).toBe(true); // reassign keeps status
    expect(canTransition("in_progress", "submitted")).toBe(true);
    expect(canTransition("in_progress", "in_progress")).toBe(true); // handoff keeps status
    expect(canTransition("in_progress", "closed")).toBe(true); // manager override
    expect(canTransition("submitted", "closed")).toBe(true);
    expect(canTransition("submitted", "in_progress")).toBe(true); // reopen / return
    expect(canTransition("closed", "in_progress")).toBe(true); // reopen
  });

  it("rejects forged / illegal moves (no unknown states)", () => {
    expect(canTransition("new", "in_progress")).toBe(false);
    expect(canTransition("new", "submitted")).toBe(false);
    expect(canTransition("new", "closed")).toBe(false);
    expect(canTransition("assigned", "closed")).toBe(false);
    expect(canTransition("assigned", "submitted")).toBe(false);
    expect(canTransition("assigned", "new")).toBe(false);
    expect(canTransition("in_progress", "new")).toBe(false);
    expect(canTransition("submitted", "new")).toBe(false);
    expect(canTransition("closed", "assigned")).toBe(false);
    expect(canTransition("closed", "new")).toBe(false);
  });
});

describe("isTaskOverdue", () => {
  it("is true for a past due instant on an open task", () => {
    for (const s of ["new", "assigned", "in_progress", "submitted"] as const) {
      expect(isTaskOverdue("2026-06-01T00:00:00Z", s, NOW)).toBe(true);
    }
  });

  it("is false for a closed task even if past due", () => {
    expect(isTaskOverdue("2026-06-01T00:00:00Z", "closed", NOW)).toBe(false);
  });

  it("is false when there is no due date", () => {
    expect(isTaskOverdue(null, "in_progress", NOW)).toBe(false);
    expect(isTaskOverdue(undefined, "in_progress", NOW)).toBe(false);
    expect(isTaskOverdue("", "in_progress", NOW)).toBe(false);
  });

  it("is false for a future due instant", () => {
    expect(isTaskOverdue("2026-12-31T00:00:00Z", "in_progress", NOW)).toBe(false);
  });

  it("is false for an unparseable date", () => {
    expect(isTaskOverdue("not-a-date", "in_progress", NOW)).toBe(false);
  });
});

describe("nextActions (UI affordance, mirror of DB authority)", () => {
  const manager = { isAssignee: false, canAssign: true, isManager: true };
  const assignee = { isAssignee: true, canAssign: false, isManager: false };
  const grantedAssigner = { isAssignee: false, canAssign: true, isManager: false };
  const bystander = { isAssignee: false, canAssign: false, isManager: false };

  it("assignee on their own task: work the lifecycle, never close/delete", () => {
    expect(nextActions("assigned", assignee)).toEqual(["start", "progress", "note", "milestone"]);
    expect(nextActions("in_progress", assignee)).toEqual([
      "progress",
      "submit",
      "note",
      "milestone",
    ]);
    // After submit, the ball is in the manager's court — no close for the engineer.
    expect(nextActions("submitted", assignee)).toEqual(["note", "milestone"]);
    expect(nextActions("submitted", assignee)).not.toContain("close");
    expect(nextActions("closed", assignee)).toEqual([]);
  });

  it("a tasks.assign holder can assign a new task and hand off an owned one", () => {
    expect(nextActions("new", grantedAssigner)).toContain("assign");
    expect(nextActions("assigned", grantedAssigner)).toContain("handoff");
    expect(nextActions("assigned", grantedAssigner)).not.toContain("assign");
    // …but never close/reopen/delete (manager-only).
    for (const s of TASK_STATUSES) {
      expect(nextActions(s, grantedAssigner)).not.toContain("close");
      expect(nextActions(s, grantedAssigner)).not.toContain("reopen");
      expect(nextActions(s, grantedAssigner)).not.toContain("delete");
    }
  });

  it("manager reviews: close from submitted, reopen, and may delete", () => {
    expect(nextActions("submitted", manager)).toEqual([
      "note",
      "milestone",
      "handoff",
      "close",
      "reopen",
      "delete",
    ]);
    expect(nextActions("closed", manager)).toEqual(["reopen", "delete"]);
  });

  it("a bystander engineer sees no actions", () => {
    for (const s of TASK_STATUSES) {
      expect(nextActions(s, bystander)).toEqual([]);
    }
  });
});

describe("catalogs", () => {
  it("has an Arabic label and badge for every status", () => {
    for (const s of TASK_STATUSES) {
      expect(TASK_STATUS_LABELS[s]).toBeTruthy();
      expect(TASK_STATUS_BADGE[s]).toBeTruthy();
    }
  });

  it("has an Arabic label and badge for every priority", () => {
    for (const p of TASK_PRIORITIES) {
      expect(TASK_PRIORITY_LABELS[p]).toBeTruthy();
      expect(TASK_PRIORITY_BADGE[p]).toBeTruthy();
    }
  });

  it("has an Arabic label for every task_event_type in the DB enum", () => {
    for (const e of Constants.public.Enums.task_event_type) {
      expect(TASK_EVENT_LABELS[e]).toBeTruthy();
    }
  });
});
