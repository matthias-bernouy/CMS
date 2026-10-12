import type { BlobStore } from "@bernouy/blob-store";
import { defaultSystem, type ContentReader, type TPage } from "@bernouy/cms-content";
import { createSitemapService } from "@bernouy/cms-seo";

export function sitemapPage(id: string, path: string): TPage {
    return {
        id,
        revision: 1,
        path,
        content: `<p>${id}</p>`,
        title: id,
        description: `${id} description`,
        visible: true,
        tags: [],
    };
}

export function sitemapService(options: { store: BlobStore; pages?: readonly TPage[]; siteHost?: () => string }) {
    const pages = options.pages ?? [];
    const content: Pick<ContentReader, "getRenderingSettings" | "getPublishedPages" | "resolvePublishedRoute"> = {
        getRenderingSettings: async () => {
            const settings = defaultSystem();
            settings.site.host = options.siteHost?.() ?? "https://example.test";
            settings.site.language = "en";
            return settings;
        },
        getPublishedPages: async () => pages,
        resolvePublishedRoute: async () => null,
    };
    return createSitemapService({
        store: options.store,
        content,
        listAdditionalPaths: async () => [],
        isReservedPath: () => false,
        execute: async () => {
            throw new Error("No indexing capability is expected in this fixture");
        },
    });
}
