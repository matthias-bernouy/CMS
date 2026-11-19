import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { assertOwnedTenantCleanup, assertDisabledTenantRecord } from "./tenant";

test("tenant retention refuses production stacks, shared sites, foreign identities and credential-bearing origins", () => {
    const stack = { id: "ulvia-mcp-aabbccdd", providerName: "ulvia-mcp-aabbccdd-provider" };
    const tenant = {
        instanceId: "instance:00000000-0000-4000-8000-000000000001",
        origin: "http://performance-00000000-0000-4000-8000-000000000002.localhost:3000",
    };
    expect(() => assertOwnedTenantCleanup(stack, tenant)).not.toThrow();
    expect(() =>
        assertOwnedTenantCleanup(stack, { ...tenant, origin: `http://perf-flow-${"a".repeat(24)}.localhost:3000` }),
    ).not.toThrow();
    for (const origin of [
        "https://ulvia.fr",
        "http://site.localhost:3000",
        "http://control.localhost:3000",
        "http://registry.localhost:3000",
        "http://perf-settings-0.localhost:3000",
        `${tenant.origin}/path`,
        `${tenant.origin}?token=private`,
        tenant.origin.replace("http://", "http://x:y@"),
    ]) {
        expect(() => assertOwnedTenantCleanup(stack, { ...tenant, origin })).toThrow();
    }
    expect(() => assertOwnedTenantCleanup({ ...stack, providerName: "production-provider" }, tenant)).toThrow();
    expect(() => assertOwnedTenantCleanup(stack, { ...tenant, instanceId: "foreign" })).toThrow();
});

test("tenant retention refuses ready, missing and mismatched records before reading storage", () => {
    const assertRecord = runInNewContext(
        `(${assertDisabledTenantRecord.toString()})`,
    ) as typeof assertDisabledTenantRecord;
    const tenant = { instanceId: "owned-id", origin: "http://owned.localhost" };
    const record = { id: tenant.instanceId, cmsUrl: tenant.origin, status: "disabled" };
    expect(() => assertRecord(tenant, record)).not.toThrow();
    for (const value of [
        null,
        { ...record, status: "ready" },
        { ...record, id: "foreign" },
        { ...record, cmsUrl: "http://foreign.localhost" },
    ]) {
        expect(() => assertRecord(tenant, value)).toThrow();
        expect(record).toEqual({ id: "owned-id", cmsUrl: "http://owned.localhost", status: "disabled" });
    }
});
