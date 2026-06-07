import { describe, it, expect } from "vitest";
import { computeEffectivePermissions, isGrantableKey } from "@/lib/auth/permission-keys";

describe("isGrantableKey", () => {
  it("allows only projects.* and tasks.*", () => {
    expect(isGrantableKey("projects.edit")).toBe(true);
    expect(isGrantableKey("tasks.assign")).toBe(true);
    expect(isGrantableKey("financials.view")).toBe(false);
    expect(isGrantableKey("clients.view")).toBe(false);
    expect(isGrantableKey("team.manage")).toBe(false);
  });
});

describe("computeEffectivePermissions", () => {
  const engineerDefaults = [
    { permission_key: "projects.view", allowed: true },
    { permission_key: "projects.edit", allowed: false },
    { permission_key: "tasks.view", allowed: true },
    { permission_key: "financials.view", allowed: false },
  ];

  it("uses role defaults when there are no overrides", () => {
    const p = computeEffectivePermissions({
      role: "engineer",
      roleDefaults: engineerDefaults,
      overrides: [],
    });
    expect(p["projects.view"]).toBe(true);
    expect(p["projects.edit"]).toBe(false);
  });

  it("applies an operational override over the role default", () => {
    const p = computeEffectivePermissions({
      role: "engineer",
      roleDefaults: engineerDefaults,
      overrides: [{ permission_key: "projects.edit", allowed: true }],
    });
    expect(p["projects.edit"]).toBe(true);
  });

  it("ignores a financials.view override for an engineer (role-bound)", () => {
    const p = computeEffectivePermissions({
      role: "engineer",
      roleDefaults: engineerDefaults,
      overrides: [{ permission_key: "financials.view", allowed: true }],
    });
    expect(p["financials.view"]).toBe(false);
  });

  it("grants financials.view to manager and accountant by role", () => {
    expect(
      computeEffectivePermissions({ role: "manager", roleDefaults: [], overrides: [] })[
        "financials.view"
      ],
    ).toBe(true);
    expect(
      computeEffectivePermissions({ role: "accountant", roleDefaults: [], overrides: [] })[
        "financials.view"
      ],
    ).toBe(true);
  });

  it("ignores non-grantable overrides entirely", () => {
    const p = computeEffectivePermissions({
      role: "engineer",
      roleDefaults: engineerDefaults,
      overrides: [{ permission_key: "team.manage", allowed: true }],
    });
    expect(p["team.manage"]).toBe(false);
  });
});
