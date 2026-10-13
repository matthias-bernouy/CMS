import type { BlobStore } from "@bernouy/blob-store";
import { defaultSystem, type ContentReader, type TPage } from "@bernouy/cms-content";
import { createSitemapService } from "@bernouy/cms-seo";
import { createSitemapChunkHandler, createSitemapHandler } from "@bernouy/cms-seo/http";

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

export function sitemapService(options: {
    store: BlobStore;
    pages?: readonly TPage[];
    siteHost?: () => string;
    siteVisible?: () => boolean;
}) {
    const pages = options.pages ?? [];
    const content: Pick<ContentReader, "getRenderingSettings" | "getPublishedPages" | "resolvePublishedRoute"> = {
        getRenderingSettings: async () => {
            const settings = defaultSystem();
            settings.site.host = options.siteHost?.() ?? "https://example.test";
            settings.site.language = "en";
            settings.site.visible = options.siteVisible?.() ?? true;
            return settings;
        },
        getPublishedPages: async () => pages,
        resolvePublishedRoute: async () => null,
    };
    return sitemapRuntime({
        store: options.store,
        content,
    }).service;
}

type SitemapRuntimeOptions = {
    store: BlobStore;
    content: Parameters<typeof createSitemapService>[0]["content"];
    execute?: Parameters<typeof createSitemapService>[0]["execute"];
    basePath?: string;
};

export function sitemapRuntime(options: SitemapRuntimeOptions) {
    const isReservedPath = () => false;
    const service = createSitemapService({
        store: options.store,
        content: options.content,
        listAdditionalPaths: async () => [],
        isReservedPath,
        execute:
            options.execute ??
            (async () => {
                throw new Error("No indexing capability is expected in this fixture");
            }),
    });
    return {
        service,
        sitemap: createSitemapHandler({ content: options.content, store: options.store, isReservedPath }),
        chunk: createSitemapChunkHandler({ store: options.store, basePath: options.basePath ?? "" }),
    };
}
