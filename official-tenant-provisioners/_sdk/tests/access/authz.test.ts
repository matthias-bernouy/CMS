import { test, expect } from "bun:test";
import { planForPath, assertPlaneAllowed } from "src/core/authz/planGuard";
import { assertActive } from "src/core/tenant/suspend";
import { PlaneError, SuspendedError } from "src/core/errors";
import type { TenantState } from "src/interfaces/TenantRegistry";

test("planForPath maps prefixes (base.md §1.1)", () => {
    expect(planForPath("/admin")).toBe("admin");
    expect(planForPath("/admin/tenants")).toBe("admin");
    expect(planForPath("/tenant/logs")).toBe("tenant");
    expect(planForPath("/anything/else")).toBe("consumption");
    expect(planForPath("/")).toBe("consumption");
});

test("§4.7: control-plane only on /admin/*", () => {
    expect(assertPlaneAllowed("control-plane", "/admin/tenants")).toBe("admin");
    expect(() => assertPlaneAllowed("control-plane", "/tenant/logs")).toThrow(PlaneError);
    expect(() => assertPlaneAllowed("control-plane", "/data?x=1")).toThrow(PlaneError);
});

test("§4.7: tenant on /tenant/* and consumption, never /admin/*", () => {
    expect(assertPlaneAllowed("tenant", "/tenant/logs")).toBe("tenant");
    expect(assertPlaneAllowed("tenant", "/notes?x=1")).toBe("consumption");
    expect(() => assertPlaneAllowed("tenant", "/admin/tenants")).toThrow(PlaneError);
});

test("suspend: suspended → SuspendedError, active/null → ok", () => {
    const base: TenantState = { tenantId: "t1", issuers: ["https://t1"], role: "tenant", status: "active" };
    expect(() => assertActive(base)).not.toThrow();
    expect(() => assertActive(null)).not.toThrow();
    expect(() => assertActive({ ...base, status: "suspended" })).toThrow(SuspendedError);
});
