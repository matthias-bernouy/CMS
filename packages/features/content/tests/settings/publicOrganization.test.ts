import { describe, expect, test } from "bun:test";
import { defaultSystem, projectPublicSiteOrganization, type TSystem } from "@bernouy/content";

describe("public site organization", () => {
    test("projects only the explicit public organization fields", () => {
        const settings = organizationSettings();
        const publicOrganization = projectPublicSiteOrganization(settings);

        expect(publicOrganization).toEqual(settings.site.organization);
        expect(JSON.stringify(publicOrganization)).not.toContain("private-api.example.com");
    });

    test("refuses incomplete organization records rather than projecting compatibility defaults", () => {
        const settings = defaultSystem();
        delete (settings.site as Partial<TSystem["site"]>).organization;

        expect(() => projectPublicSiteOrganization(settings)).toThrow();
    });
});

function organizationSettings(): TSystem {
    const settings = defaultSystem();
    settings.site.organization = {
        name: "Example",
        legalName: "Example SAS",
        description: "Site publisher",
        logo: "/.cms/call/ulvia/cms.files/files/logo/generation",
        email: "contact@example.com",
        telephone: "+33123456789",
        address: {
            streetAddress: "10 Example Street",
            postalCode: "75001",
            addressLocality: "Paris",
            addressRegion: "Île-de-France",
            addressCountry: "FR",
        },
        sameAs: ["https://social.example.com/example"],
    };
    return settings;
}
