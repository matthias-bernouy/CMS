import { describe, test, expect } from "bun:test";
import { MemoryTenantProvisionerImportsRepository } from "src/default-implementation/MemoryTenantProvisionerImportsRepository";
import type { TenantProvisionerImport } from "src/interfaces/TenantProvisionerImport";
import { HubError } from "src/core/HubError";

function fixture(over: Partial<TenantProvisionerImport> = {}): TenantProvisionerImport {
    return {
        providerId: "delivery-acme",
        url:        "https://delivery.acme.com",
        iss:        "https://delivery.acme.com",
        importedAt: new Date("2026-01-01"),
        cachedAt:   new Date("2026-01-01"),
        schemas: {
            info:         { providerId: "delivery-acme" },
            metadoc:      { issuer: "https://delivery.acme.com" },
            jwks:         { keys: [] },
            openapiAdmin: { openapi: "3.0.3" },
        },
        ...over,
    };
}

describe("MemoryTenantProvisionerImportsRepository", () => {
    test("insert + getByProviderId round-trip", async () => {
        const r = new MemoryTenantProvisionerImportsRepository();
        const doc = fixture();
        await r.insert(doc);
        expect(await r.getByProviderId("delivery-acme")).toEqual(doc);
        expect(await r.getByUrl("https://delivery.acme.com")).toEqual(doc);
        expect(await r.getByIss("https://delivery.acme.com")).toEqual(doc);
    });

    test("insert with duplicate providerId throws duplicate_provider_id", async () => {
        const r = new MemoryTenantProvisionerImportsRepository();
        await r.insert(fixture());
        try { await r.insert(fixture()); throw new Error("should have thrown"); }
        catch (e) {
            expect(e).toBeInstanceOf(HubError);
            expect((e as HubError).code).toBe("duplicate_provider_id");
        }
    });

    test("insert with duplicate url throws", async () => {
        const r = new MemoryTenantProvisionerImportsRepository();
        await r.insert(fixture({ providerId: "p1", iss: "https://i1.example", url: "https://shared.example" }));
        try {
            await r.insert(fixture({ providerId: "p2", iss: "https://i2.example", url: "https://shared.example" }));
            throw new Error("should have thrown");
        }
        catch (e) { expect((e as HubError).code).toBe("duplicate_provider_id"); }
    });

    test("insert with duplicate iss throws", async () => {
        const r = new MemoryTenantProvisionerImportsRepository();
        await r.insert(fixture({ providerId: "p1", url: "https://u1.example", iss: "https://shared.example" }));
        try {
            await r.insert(fixture({ providerId: "p2", url: "https://u2.example", iss: "https://shared.example" }));
            throw new Error("should have thrown");
        }
        catch (e) { expect((e as HubError).code).toBe("duplicate_provider_id"); }
    });

    test("list returns sorted by providerId", async () => {
        const r = new MemoryTenantProvisionerImportsRepository();
        await r.insert(fixture({ providerId: "z", url: "https://z.example", iss: "https://z.example" }));
        await r.insert(fixture({ providerId: "a", url: "https://a.example", iss: "https://a.example" }));
        await r.insert(fixture({ providerId: "m", url: "https://m.example", iss: "https://m.example" }));
        expect((await r.list()).map((d) => d.providerId)).toEqual(["a", "m", "z"]);
    });

    test("updateSchemas updates fields, preserves _id-like data", async () => {
        const r = new MemoryTenantProvisionerImportsRepository();
        await r.insert(fixture());
        const newSchemas: TenantProvisionerImport["schemas"] = {
            info:         { x: 1 },
            metadoc:      { y: 2 },
            jwks:         { keys: [{ kty: "EC" }] },
            openapiAdmin: { openapi: "3.0.3", info: { version: "2" } },
        };
        const updated = await r.updateSchemas("delivery-acme", newSchemas, new Date("2026-02-01"));
        expect(updated?.schemas).toEqual(newSchemas);
        expect(updated?.cachedAt).toEqual(new Date("2026-02-01"));
        expect(updated?.importedAt).toEqual(new Date("2026-01-01"));   // preserved
    });

    test("updateSchemas on unknown providerId returns null", async () => {
        const r = new MemoryTenantProvisionerImportsRepository();
        expect(await r.updateSchemas("ghost", {} as TenantProvisionerImport["schemas"], new Date())).toBeNull();
    });

    test("remove returns true/false appropriately", async () => {
        const r = new MemoryTenantProvisionerImportsRepository();
        await r.insert(fixture());
        expect(await r.remove("delivery-acme")).toBe(true);
        expect(await r.remove("delivery-acme")).toBe(false);
        expect(await r.getByProviderId("delivery-acme")).toBeNull();
    });
});
