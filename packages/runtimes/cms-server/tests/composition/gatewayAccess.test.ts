import { expect, test } from "bun:test";
import type { LocalCredentialStore } from "@bernouy/cms-auth";
import type { CapabilityGatewayOptions } from "@bernouy/cms-gateway";
import type { Db } from "mongodb";
import { createProductionGatewayAccess } from "../../src/runtime/gateway/access";

test("production gateway grants Delivery, scoped collection Pages and bootstrap-admin Control calls", async () => {
    const credentials = {
        getByEmail: async () => ({ sub: "bootstrap-1" }),
    } as unknown as LocalCredentialStore;
    const grants = new Set<string>();
    const db = {
        collection: () => ({
            findOne: async ({ sub }: { sub: string }) => (grants.has(sub) ? { sub } : null),
            find: () => ({ toArray: async () => [...grants].map((sub) => ({ sub })) }),
            updateOne: async ({ sub }: { sub: string }) => {
                grants.add(sub);
            },
            deleteOne: async ({ sub }: { sub: string }) => {
                grants.delete(sub);
            },
        }),
    } as unknown as Db;
    const access = createProductionGatewayAccess(credentials, "admin@example.test", db);
    expect(await access.isAdministrator({ identifier: "local:bootstrap-1" })).toBe(true);
    expect(await access.isAdministrator({ identifier: "oidc:bootstrap-1" })).toBe(false);
    await access.administrators.set("oidc:member-1", true);
    expect(await access.isAdministrator({ identifier: "oidc:member-1" })).toBe(true);
    expect(await access.administrators.list()).toEqual(["oidc:member-1", "local:bootstrap-1"]);
    await access.administrators.set("oidc:member-1", false);
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
