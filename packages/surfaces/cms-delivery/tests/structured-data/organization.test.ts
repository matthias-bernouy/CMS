import { describe, expect, test } from "bun:test";
import { defaultSystem } from "@bernouy/cms-content";
import { parseHTML } from "linkedom";
import { completeSettings, homePage, renderedHtml } from "./fixture";

describe("Site structured data", () => {
    test("renders the organization, website, and webpage graph on the indexable homepage", async () => {
        const settings = completeSettings();
        const { document } = parseHTML(await renderedHtml(homePage(), settings));
        const script = document.querySelector('script[type="application/ld+json"]');

        expect(JSON.parse(script?.textContent ?? "")).toEqual({
            "@context": "https://schema.org",
            "@graph": [
                {
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
                },
                {
                    "@type": "WebSite",
                    "@id": "https://example.com/site/#website",
                    url: "https://example.com/site/",
                    name: "Example website",
                    inLanguage: "fr-FR",
                    publisher: { "@id": "https://example.com/site/#organization" },
                },
                {
                    "@type": "WebPage",
                    "@id": "https://example.com/site/#webpage",
                    url: "https://example.com/site/",
                    isPartOf: { "@id": "https://example.com/site/#website" },
                    name: "Home",
                    description: "Homepage",
                    inLanguage: "fr-FR",
                },
            ],
        });
    });

    test("renders only webpage data away from the homepage and omits all data for noindex pages", async () => {
        const settings = completeSettings();
        const about = parseHTML(await renderedHtml({ ...homePage(), path: "/about" }, settings)).document;
        const dynamicRoot = parseHTML(
            await renderedHtml(homePage(), settings, { canonical: { queryParam: "item", value: "chair" } }),
        ).document;
        const noindex = parseHTML(await renderedHtml(homePage(), settings, { indexable: false })).document;

        expect(structuredData(about)).toEqual({
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "WebPage",
                    "@id": "https://example.com/site/about#webpage",
                    url: "https://example.com/site/about",
                    isPartOf: { "@id": "https://example.com/site/#website" },
                    name: "Home",
                    description: "Homepage",
                    inLanguage: "fr-FR",
                },
            ],
        });
        expect(structuredData(dynamicRoot)?.["@graph"]).toEqual([
            expect.objectContaining({ "@type": "WebPage", url: "https://example.com/site/?item=chair" }),
        ]);
        expect(noindex.querySelector('script[type="application/ld+json"]')).toBeNull();
    });

    test("requires a canonical host but not organization settings", async () => {
        const withoutHost = completeSettings();
        withoutHost.site.host = "";
        const withoutName = completeSettings();
        withoutName.site.organization.name = "";

        const hostless = parseHTML(await renderedHtml(homePage(), withoutHost)).document;
        const organizationless = parseHTML(await renderedHtml(homePage(), withoutName)).document;

        expect(hostless.querySelector('script[type="application/ld+json"]')).toBeNull();
        expect(structuredData(organizationless)?.["@graph"]).toHaveLength(2);
        expect(structuredData(organizationless)?.["@graph"]).not.toContainEqual(
            expect.objectContaining({ "@type": "Organization" }),
        );
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
            "@graph": [
                {
                    "@type": "Organization",
                    "@id": "https://example.com/#organization",
                    name: "Example </script><script>alert(1)</script>",
                    url: "https://example.com/",
                },
                {
                    "@type": "WebSite",
                    "@id": "https://example.com/#website",
                    url: "https://example.com/",
                    publisher: { "@id": "https://example.com/#organization" },
                },
                {
                    "@type": "WebPage",
                    "@id": "https://example.com/#webpage",
                    url: "https://example.com/",
                    isPartOf: { "@id": "https://example.com/#website" },
                    name: "Home",
                    description: "Homepage",
                },
            ],
        });
    });
});

function structuredData(document: Document): Record<string, unknown> | null {
    const content = document.querySelector('script[type="application/ld+json"]')?.textContent;
    return content ? JSON.parse(content) : null;
}
