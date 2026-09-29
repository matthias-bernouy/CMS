import { describe, expect, test } from "bun:test";
import { defaultSystem, projectPublicSiteOrganization, type TSystem } from "@bernouy/cms-content";

describe("public site organization", () => {
    test("projects only the explicit public organization fields", () => {
        const settings = organizationSettings();
        const publicOrganization = projectPublicSiteOrganization(settings);

        expect(publicOrganization).toEqual(settings.site.organization);
        expect(JSON.stringify(publicOrganization)).not.toContain("SMTP_PASSWORD");
        expect(JSON.stringify(publicOrganization)).not.toContain("private-api.example.com");
    });

    test("keeps the public projection complete when legacy settings omit organization", () => {
        const settings = defaultSystem();
        delete (settings.site as Partial<TSystem["site"]>).organization;

        expect(projectPublicSiteOrganization(settings)).toEqual(defaultSystem().site.organization);
    });
});

function organizationSettings(): TSystem {
    const settings = defaultSystem();
    settings.site.organization = {
        name: "Example",
        legalName: "Example SAS",
        description: "Site publisher",
        logo: "/.cms/files/by-id/logo",
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
    settings.email.smtp.passwordSecretRef = "SMTP_PASSWORD";
    settings.security.connectExtras = ["https://private-api.example.com"];
    return settings;
}
