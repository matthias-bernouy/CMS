import { expect, test } from "bun:test";
import type { LocalCredentialStore } from "@bernouy/cms-auth";
import type { CapabilityGatewayOptions } from "@bernouy/cms-gateway";
import type { Db } from "mongodb";
import { createProductionGatewayAccess } from "../../src/runtime/gateway/access";

test("production gateway grants Delivery, scoped collection Pages and bootstrap-admin Control calls", async () => {
    const credentials = {
        getByEmail: async () => ({ sub: "bootstrap-1" }),
    } as unknown as LocalCredentialStore;
    const grants = new Map<string, { sub: string; enabled: boolean; revision: number }>();
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
    const access = createProductionGatewayAccess(credentials, "admin@example.test", db);
    expect(await access.isAdministrator({ identifier: "local:bootstrap-1" })).toBe(true);
    expect(await access.isAdministrator({ identifier: "oidc:bootstrap-1" })).toBe(false);
    const granted = await access.administrators.set("oidc:member-1", true, 0);
    expect(granted.revision).toBe(1);
    expect(await access.isAdministrator({ identifier: "oidc:member-1" })).toBe(true);
    expect(await access.administrators.list()).toEqual(["oidc:member-1", "local:bootstrap-1"]);
    await expect(access.administrators.set("oidc:member-1", false, 0)).rejects.toMatchObject({ status: 409 });
    await access.administrators.set("oidc:member-1", false, 1);
    expect(await access.isAdministrator({ identifier: "oidc:member-1" })).toBe(false);
    expect(access.administrators.set("local:bootstrap-1", false)).rejects.toThrow();

    const publicCapability = { access: "public" } as Parameters<CapabilityGatewayOptions["authorize"]>[1];
    const privateCapability = { access: "authenticated" } as Parameters<CapabilityGatewayOptions["authorize"]>[1];
    const route = {} as Parameters<CapabilityGatewayOptions["authorize"]>[2];
    expect(await access.authorize({ kind: "anonymous" }, publicCapability, route, "delivery")).toBe(true);
    expect(await access.authorize({ kind: "user", subjectId: "user-1" }, privateCapability, route, "delivery")).toBe(
        true,
    );
    expect(await access.authorize({ kind: "anonymous" }, privateCapability, route, "delivery")).toBe(false);
    expect(
        await access.authorize(
            { kind: "administrator", subjectId: "local:bootstrap-1" },
            privateCapability,
            route,
            "control",
        ),
    ).toBe(true);
    expect(await access.authorize({ kind: "user", subjectId: "user-1" }, publicCapability, route, "control")).toBe(
        false,
    );
    expect(await access.authorize({ kind: "user", subjectId: "user-1" }, publicCapability, route, "page")).toBe(true);
    expect(await access.authorize({ kind: "user", subjectId: "user-1" }, privateCapability, route, "page")).toBe(true);
});
