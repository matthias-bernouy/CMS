import { expect, test } from "bun:test";
import type { CapabilityGatewayOptions } from "@bernouy/cms-gateway";
import type { Db } from "mongodb";
import { createProductionGatewayAccess } from "../../src/runtime/gateway/access";

test("production gateway derives Page access from capability access", async () => {
    const db = memoryDb(["local:administrator-1"]);
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
    await expect(access.administrators.set("local:administrator-1", false, 1)).rejects.toMatchObject({ status: 409 });
    expect(await access.isAdministrator({ identifier: "local:administrator-1" })).toBe(true);

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
    ).toBe(true);
    expect(await access.authorize({ kind: "user", subjectId: "user-1" }, publicCapability, route, "page")).toBe(true);
    expect(await access.authorize({ kind: "user", subjectId: "user-1" }, privateCapability, route, "page")).toBe(true);
    expect(await access.authorize({ kind: "user", subjectId: "user-1" }, adminCapability, route, "page")).toBe(false);
    expect(
        await access.authorize({ kind: "administrator", subjectId: "oidc:member-1" }, adminCapability, route, "page"),
    ).toBe(false);
});

test("concurrent revocations preserve one administrator", async () => {
    const access = createProductionGatewayAccess(memoryDb(["admin:a", "admin:b"]));
    const results = await Promise.allSettled([
        access.administrators.set("admin:a", false, 1),
        access.administrators.set("admin:b", false, 1),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await access.administrators.list()).toHaveLength(1);
});

function memoryDb(subjects: readonly string[]): Db {
    let authority = {
        _id: "authority",
        revision: 1,
        grants: subjects.map((sub) => ({
            sub,
            enabled: true,
            revision: 1,
            createdAt: new Date(0),
            updatedAt: new Date(0),
        })),
    };
    return {
        collection: (name: string) =>
            name === "cms_administrator_authority"
                ? {
                      findOne: async () => structuredClone(authority),
                      insertOne: async () => {
                          throw Object.assign(new Error("duplicate"), { code: 11000 });
                      },
                      replaceOne: async (filter: { revision: number }, replacement: typeof authority) => {
                          if (filter.revision !== authority.revision) {
                              return { matchedCount: 0 };
                          }
                          authority = structuredClone(replacement);
                          return { matchedCount: 1 };
                      },
                  }
                : {},
    } as unknown as Db;
}
