import { defaultSystem, type TPage, type TSystem } from "@bernouy/cms-content";
import { definePageStructuredData, resolvePageMetadata, type PageRenderMetadata } from "@bernouy/cms-content/seo";
import { parseHTML } from "linkedom";

export function completeSettings(): TSystem {
    const settings = defaultSystem();
    settings.site.host = "https://example.com/site";
    settings.site.name = "Example website";
    settings.site.language = "fr-FR";
    settings.site.organization = {
        name: "Example",
        legalName: "Example SAS",
        description: "Site publisher",
        logo: "/site/.cms/call/ulvia.cms.files/files/logo/generation",
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

export function homePage(): TPage {
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

export async function renderedHtml(page: TPage, settings: TSystem, metadata: PageRenderMetadata = {}): Promise<string> {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    definePageStructuredData(document, document.head, settings, resolvePageMetadata(page, settings, metadata));
    return document.toString();
}
