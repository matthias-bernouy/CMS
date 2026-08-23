import { describe, expect, test } from "bun:test";
import { defaultSystem, type ContentReader, type TPage, type TSystem } from "@bernouy/cms-content";
import { parseHTML } from "linkedom";
import { renderPage } from "cms-delivery/core/html/renderPage";
import type { RenderContext } from "cms-delivery/core/html/RenderContext";

describe("Organization structured data", () => {
    test("renders the public organization on the indexable homepage", async () => {
        const settings = completeSettings();
        const { document } = parseHTML(await renderedHtml(homePage(), settings));
        const script = document.querySelector('script[type="application/ld+json"]');

        expect(JSON.parse(script?.textContent ?? "")).toEqual({
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": "https://example.com/site/#organization",
            name: "Example",
            url: "https://example.com/site/",
            legalName: "Example SAS",
            description: "Site publisher",
            logo: "https://example.com/site/.cms/files/by-id/logo",
            email: "contact@example.com",
            telephone: "+33123456789",
            sameAs: ["https://social.example.com/example"],
            address: {
                "@type": "PostalAddress",
                streetAddress: "10 Example Street",
                postalCode: "75001",
                addressLocality: "Paris",
                addressRegion: "Île-de-France",
                addressCountry: "FR",
            },
        });
    });

    test("omits organization data away from the homepage and on a noindex homepage", async () => {
        const settings = completeSettings();
        const about = parseHTML(await renderedHtml({ ...homePage(), path: "/about" }, settings)).document;
        const noindex = parseHTML(await renderedHtml(homePage(), settings, { indexable: false })).document;

        expect(about.querySelector('script[type="application/ld+json"]')).toBeNull();
        expect(noindex.querySelector('script[type="application/ld+json"]')).toBeNull();
    });

    test("requires a canonical host and organization name", async () => {
        const withoutHost = completeSettings();
        withoutHost.site.host = "";
        const withoutName = completeSettings();
        withoutName.site.organization.name = "";

        for (const settings of [withoutHost, withoutName]) {
            const { document } = parseHTML(await renderedHtml(homePage(), settings));
            expect(document.querySelector('script[type="application/ld+json"]')).toBeNull();
        }
    });

    test("omits empty fields and safely serializes script-looking content", async () => {
        const settings = defaultSystem();
        settings.site.host = "https://example.com";
        settings.site.organization.name = "Example </script><script>alert(1)</script>";

        const html = await renderedHtml(homePage(), settings);
        const { document } = parseHTML(html);
        const script = document.querySelector('script[type="application/ld+json"]');

        expect(html).not.toContain("</script><script>alert(1)</script>");
        expect(script?.textContent).toContain("\\u003c/script>");
        expect(JSON.parse(script?.textContent ?? "")).toEqual({
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": "https://example.com/#organization",
            name: "Example </script><script>alert(1)</script>",
            url: "https://example.com/",
        });
    });
});

function completeSettings(): TSystem {
    const settings = defaultSystem();
    settings.site.host = "https://example.com/site";
    settings.site.organization = {
        name: "Example",
        legalName: "Example SAS",
        description: "Site publisher",
        logo: "/site/.cms/files/by-id/logo",
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

function homePage(): TPage {
    return {
        id: "home",
        path: "/",
        title: "Home",
        description: "Homepage",
        content: "<main>Home</main>",
        status: "published",
        tags: [],
    } as TPage;
}

async function renderedHtml(page: TPage, settings: TSystem, metadata = {}): Promise<string> {
    const context: RenderContext = {
        repository: {
            getSystem: async () => settings,
            getBlocsList: async () => [],
        } as ContentReader,
        resolveAssets: async () => ({
            componentUrl: "/.cms/assets/component.js",
            bindingCoreUrl: "/.cms/assets/binding.js",
            styleUrl: "/.cms/style",
            blocUrls: [],
            scriptUrls: ["/.cms/assets/component.js"],
        }),
        faviconUrl: "/favicon.ico",
        headInjectors: [],
    };
    const entry = await renderPage(page, context, metadata);
    return new TextDecoder().decode(entry.raw);
}
