import { describe, test, expect } from "bun:test";
import { ProvisionTenantInputSchema } from "src/core/schemas/provisionTenant";

const VALID = {
    slug: "acme",
    name: "ACME",
    adminUser: { username: "matt", email: "matt@acme.com" },
};

describe("ProvisionTenantInputSchema", () => {
    test("accepts the minimal valid body", () => {
        expect(ProvisionTenantInputSchema.parse(VALID).slug).toBe("acme");
    });

    test.each([
        ["UPPER",                "uppercase rejected"],
        ["acme_test",            "underscore rejected"],
        ["-leading-dash",        "leading dash rejected"],
        ["trailing-dash-",       "trailing dash rejected"],
        ["a".repeat(64),         "longer than 63 rejected"],
    ])("rejects invalid slug %p (%s)", (slug) => {
        expect(ProvisionTenantInputSchema.safeParse({ ...VALID, slug }).success).toBe(false);
    });

    test("rejects empty name", () => {
        expect(ProvisionTenantInputSchema.safeParse({ ...VALID, name: "" }).success).toBe(false);
    });

    test("rejects email without @", () => {
        expect(ProvisionTenantInputSchema.safeParse({ ...VALID, adminUser: { username: "x", email: "no-at-sign" } }).success).toBe(false);
    });

    test("propagates optional fields when provided", () => {
        const dto = ProvisionTenantInputSchema.parse({
            ...VALID,
            adminUser: { ...VALID.adminUser, firstName: "Matt", lastName: "Doe" },
            publicAlias:                 "acme.com",
            deliveryEnabled:             true,
            welcomeRedirectUri:          "https://cms/x",
            welcomeLinkLifespanSeconds:  86400,
            bucketOverrides:             { cacheControl: "no-store" },
        });
        expect(dto.adminUser.firstName).toBe("Matt");
        expect(dto.publicAlias).toBe("acme.com");
        expect(dto.deliveryEnabled).toBe(true);
        expect(dto.welcomeLinkLifespanSeconds).toBe(86400);
        expect(dto.bucketOverrides).toEqual({ cacheControl: "no-store" });
    });

    test("rejects wrong types on optional fields", () => {
        expect(ProvisionTenantInputSchema.safeParse({ ...VALID, deliveryEnabled: "yes" }).success).toBe(false);
        expect(ProvisionTenantInputSchema.safeParse({ ...VALID, welcomeLinkLifespanSeconds: "1d" }).success).toBe(false);
    });

    test("rejects unknown fields when strict mode is on (Zod default = strip silently — kept default)", () => {
        // Default is to strip unknown keys. We rely on this to ignore extra fields the UI may send.
        const dto = ProvisionTenantInputSchema.parse({ ...VALID, extraField: "ignored" });
        expect((dto as unknown as { extraField?: string }).extraField).toBeUndefined();
    });
});
