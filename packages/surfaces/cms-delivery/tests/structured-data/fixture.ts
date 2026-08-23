import { defaultSystem, type ContentReader, type TPage, type TSystem } from "@bernouy/cms-content";
import { renderPage } from "cms-delivery/core/html/renderPage";
import type { RenderContext } from "cms-delivery/core/html/RenderContext";
import type { PageRenderMetadata } from "cms-delivery/core/seo/pageMetadata";

export function completeSettings(): TSystem {
    const settings = defaultSystem();
    settings.site.host = "https://example.com/site";
    settings.site.name = "Example website";
    settings.site.language = "fr-FR";
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
