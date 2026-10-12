import { expect, test } from "bun:test";
import type { CapabilityGatewayOptions } from "@bernouy/cms-gateway";
import type { Db } from "mongodb";
import { createProductionGatewayAccess } from "../../src/runtime/gateway/access";

test("production gateway derives Page access from capability access", async () => {
    const grants = new Map<string, { sub: string; enabled: boolean; revision: number }>([
        ["local:administrator-1", { sub: "local:administrator-1", enabled: true, revision: 1 }],
    ]);
    const db = {
        collection: () => ({
            findOne: async ({ sub, enabled }: { sub: string; enabled?: { $ne: boolean } }) => {
                const row = grants.get(sub) ?? null;
                return row && enabled?.$ne === false && !row.enabled ? null : row;
            },
            find: () => ({ toArray: async () => [...grants.values()].filter(({ enabled }) => enabled) }),
            insertOne: async (row: { sub: string; enabled: boolean; revision: number }) => {
                grants.set(row.sub, row);
            },
            findOneAndUpdate: async (
                { sub }: { sub: string },
                update: { $set: { enabled: boolean; revision: number } },
            ) => {
                const row = grants.get(sub);
                if (!row) {
                    return null;
                }
                const next = { ...row, ...update.$set };
                grants.set(sub, next);
                return next;
            },
        }),
    } as unknown as Db;
    const access = createProductionGatewayAccess(db);
    expect(await access.isAdministrator({ identifier: "local:administrator-1" })).toBe(true);
    expect(await access.isAdministrator({ identifier: "oidc:administrator-1" })).toBe(false);
    const granted = await access.administrators.set("oidc:member-1", true, 0);
    expect(granted.revision).toBe(1);
    expect(await access.isAdministrator({ identifier: "oidc:member-1" })).toBe(true);
    expect(await access.administrators.list()).toEqual(["local:administrator-1", "oidc:member-1"]);
    await expect(access.administrators.set("oidc:member-1", false, 0)).rejects.toMatchObject({ status: 409 });
    await access.administrators.set("oidc:member-1", false, 1);
    expect(await access.isAdministrator({ identifier: "oidc:member-1" })).toBe(false);
    await access.administrators.set("local:administrator-1", false, 1);
    expect(await access.isAdministrator({ identifier: "local:administrator-1" })).toBe(false);

    const publicCapability = { access: "public" } as Parameters<CapabilityGatewayOptions["authorize"]>[1];
    const privateCapability = { access: "authenticated" } as Parameters<CapabilityGatewayOptions["authorize"]>[1];
    const adminCapability = { access: "admin" } as Parameters<CapabilityGatewayOptions["authorize"]>[1];
    const route = {} as Parameters<CapabilityGatewayOptions["authorize"]>[2];
    expect(await access.authorize({ kind: "anonymous" }, publicCapability, route, "page")).toBe(true);
    expect(await access.authorize({ kind: "user", subjectId: "user-1" }, privateCapability, route, "page")).toBe(true);
    expect(await access.authorize({ kind: "anonymous" }, privateCapability, route, "page")).toBe(false);
    expect(
        await access.authorize(
            { kind: "administrator", subjectId: "local:administrator-1" },
            adminCapability,
            route,
            "page",
        ),
    ).toBe(false);
    expect(await access.authorize({ kind: "user", subjectId: "user-1" }, publicCapability, route, "page")).toBe(true);
    expect(await access.authorize({ kind: "user", subjectId: "user-1" }, privateCapability, route, "page")).toBe(true);
    expect(await access.authorize({ kind: "user", subjectId: "user-1" }, adminCapability, route, "page")).toBe(false);
    expect(
        await access.authorize({ kind: "administrator", subjectId: "oidc:member-1" }, adminCapability, route, "page"),
    ).toBe(false);
});
