import { describe, expect, test } from "bun:test";
import { ContentValidationError, defaultSystem, mergeSystemUpdate, validateSettingsPatch } from "@bernouy/cms-content";

describe("site organization settings", () => {
    test("provides an empty organization by default", () => {
        expect(defaultSystem().site.organization).toEqual({
            name: "",
            legalName: "",
            description: "",
            logo: "",
            email: "",
            telephone: "",
            address: {
                streetAddress: "",
                postalCode: "",
                addressLocality: "",
                addressRegion: "",
                addressCountry: "",
            },
            sameAs: [],
        });
    });

    test("deep-merges partial organization and address updates", () => {
        const current = defaultSystem();
        current.site.organization.name = "Example";
        current.site.organization.address.addressLocality = "Paris";

        const merged = mergeSystemUpdate(current, {
            site: {
                organization: {
                    legalName: "Example SAS",
                    address: { postalCode: "75001" },
                },
            } as never,
        });

        expect(merged.site.organization.name).toBe("Example");
        expect(merged.site.organization.legalName).toBe("Example SAS");
        expect(merged.site.organization.address).toMatchObject({ addressLocality: "Paris", postalCode: "75001" });
    });

    test("normalizes organization fields and public profile URLs", () => {
        const normalized = validateSettingsPatch({
            site: {
                organization: {
                    name: "  Example  ",
                    email: " contact@example.com ",
                    address: { addressLocality: " Paris " },
                    sameAs: [" https://example.com/profile ", "https://example.com/profile"],
                },
            },
        });

        expect(normalized.site?.organization).toMatchObject({
            name: "Example",
            email: "contact@example.com",
            address: { addressLocality: "Paris" },
            sameAs: ["https://example.com/profile"],
        });
    });

    test.each(["profile", "ftp://example.com/profile", "https://user@example.com/profile"])(
        "rejects an unsafe public profile URL: %s",
        (sameAs) => {
            expect(() => validateSettingsPatch({ site: { organization: { sameAs: [sameAs] } } })).toThrow(
                ContentValidationError,
            );
        },
    );
});
