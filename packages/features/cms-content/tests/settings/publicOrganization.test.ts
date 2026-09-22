import { describe, expect, test } from "bun:test";
import { SYSTEM_SITE_SOURCE } from "@bernouy/cms-sources";
import { defaultSystem, executeSiteSystemSourceEndpoint, type ContentReader, type TSystem } from "@bernouy/cms-content";

describe("site system source", () => {
    test("returns only the explicit public organization projection", async () => {
        const settings = organizationSettings();
        const repository = { getSystem: async () => settings } as ContentReader;
        const endpoint = SYSTEM_SITE_SOURCE.endpoints[0]!;

        const response = await executeSiteSystemSourceEndpoint(repository, endpoint);

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.json()).toEqual(settings.site.organization);
    });

    test("rejects any undeclared site system target", async () => {
        const repository = { getSystem: async () => organizationSettings() } as ContentReader;

        await expect(
            executeSiteSystemSourceEndpoint(repository, {
                urn: "urn:system-site:settings",
                targetUrl: "cms-system://site/settings",
            }),
        ).rejects.toThrow("unsupported site system target");
    });

    test("keeps the public contract complete for legacy settings", async () => {
        const settings = defaultSystem();
        delete (settings.site as Partial<TSystem["site"]>).organization;
        const repository = { getSystem: async () => settings } as ContentReader;

        const response = await executeSiteSystemSourceEndpoint(repository, SYSTEM_SITE_SOURCE.endpoints[0]!);

        expect(await response.json()).toEqual(defaultSystem().site.organization);
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
