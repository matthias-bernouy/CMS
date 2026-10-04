import type { ContentReader, RenderingSettings } from "@bernouy/cms-content/rendering";
import type { BlobReader } from "@bernouy/blob-store";
import type { VariantStore, SitemapStore } from "@bernouy/cms-content/files/serving";
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
const variants: VariantStore = { ...originals, put: async () => ({ size: 0 }) };
const sitemaps: SitemapStore = { ...variants, delete: async () => {} };

export const config: DeliveryCmsConfig = {
    repository: reader,
    filesMetadata: { getItem: async () => null, getItemByPath: async () => null },
    filesBlob: originals,
    variantStore: variants,
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
// @ts-expect-error Variant writers do not receive retention deletion.
variants.delete("original");
// @ts-expect-error Original blobs must not be used as a writable derivative store.
const invalidVariantStore: VariantStore = originals;
void invalidVariantStore;
