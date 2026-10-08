import type { ContentReader, RenderingSettings } from "@bernouy/cms-content/rendering";
import type { BlobReader, BlobStore as SitemapStore } from "@bernouy/blob-store";
import type { DeliveryCmsConfig } from "@bernouy/cms-delivery";

declare const settings: RenderingSettings;

const reader: ContentReader = {
    getPublishedPage: async () => null,
    getPublishedPageById: async () => null,
    getPublishedPages: async () => [],
    resolvePublishedRoute: async () => null,
    getRenderableBlocs: async () => [],
    getBlocViewJS: async () => null,
    getRenderingSettings: async () => settings,
};
const originals: BlobReader = { get: async () => null, head: async () => null };
const sitemaps: SitemapStore = {
    ...originals,
    exists: async () => false,
    put: async () => ({ size: 0 }),
    delete: async () => {},
};

export const config: DeliveryCmsConfig = {
    repository: reader,
    sitemapStore: sitemaps,
};

// This fixture is compiled, never executed. These failures are part of the API contract.
// @ts-expect-error Editorial page lookup is not a public capability.
reader.getPage("/draft");
// @ts-expect-error Editorial enumeration is not a public capability.
reader.getAllPages();
// @ts-expect-error Full settings are unavailable to public rendering.
reader.getSystem();
// @ts-expect-error SMTP configuration is absent from rendering settings.
settings.email;
// @ts-expect-error Authoring-only languages are absent from rendering settings.
settings.site.additionalLanguages;
// @ts-expect-error Delivery cannot write an original blob.
originals.put("original", new Uint8Array());
