import { describe, expect, test } from "bun:test";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { parseSettingsUpdateDto } from "cms-control/core/validation/settings/parseUpdateDto";

describe("parseSettingsUpdateDto — site organization", () => {
    test("parses the organization form into nested settings", () => {
        const dto = parseSettingsUpdateDto({
            "site.organization.name": "Example",
            "site.organization.legalName": "Example SAS",
            "site.organization.description": "Publisher",
            "site.organization.logo": "/media/logo.svg",
            "site.organization.email": "contact@example.com",
            "site.organization.telephone": "+33123456789",
            "site.organization.address.streetAddress": "10 Example Street",
            "site.organization.address.postalCode": "75001",
            "site.organization.address.addressLocality": "Paris",
            "site.organization.address.addressRegion": "Île-de-France",
            "site.organization.address.addressCountry": "FR",
            "site.organization.sameAs": "https://linkedin.com/company/example\nhttps://github.com/example",
        });

        expect(dto.site).toMatchObject({
            organization: {
                name: "Example",
                legalName: "Example SAS",
                description: "Publisher",
                logo: "/media/logo.svg",
                email: "contact@example.com",
                telephone: "+33123456789",
                address: {
                    streetAddress: "10 Example Street",
                    postalCode: "75001",
                    addressLocality: "Paris",
                    addressRegion: "Île-de-France",
                    addressCountry: "FR",
                },
                sameAs: ["https://linkedin.com/company/example", "https://github.com/example"],
            },
        });
        expect(Object.keys(dto.site ?? {})).toEqual(["organization"]);
    });

    test("does not reset unrelated site settings", () => {
        const dto = parseSettingsUpdateDto({ "site.organization.name": "Example" });

        expect(dto.site?.name).toBeUndefined();
        expect(dto.site?.notFound).toBeUndefined();
        expect(dto.site?.organization.name).toBe("Example");
    });

    test("rejects a non-string profile list", () => {
        expect(() => parseSettingsUpdateDto({ "site.organization.sameAs": 42 })).toThrow(InvalidParam);
    });
});
