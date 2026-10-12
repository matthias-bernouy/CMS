import type { Authentication } from "@bernouy/cms-auth";
import type { ContentReader, RenderingSettings } from "@bernouy/cms-content/rendering";
import type { BlobReader, BlobStore as SitemapStore } from "@bernouy/blob-store";
import type { KernelCmsConfig } from "@bernouy/cms-kernel";
import type { Cache, Runner } from "@bernouy/http-runner";

declare const settings: RenderingSettings;
declare const authentication: Authentication;
declare const runner: Runner;
declare const cache: Cache;

const reader: ContentReader = {
    getRenderablePage: async () => null,
    getRenderablePages: async () => [],
    resolvePageReference: async () => null,
    resolveRenderableRoute: async () => null,
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

export const config: KernelCmsConfig = {
    content: reader,
    authentication,
    runner,
    cache,
    sitemapStore: sitemaps,
};

// @ts-expect-error The HTTP surface no longer accepts the writable repository property.
const invalidRepositoryConfig: KernelCmsConfig = { repository: reader, authentication, runner, cache };
void invalidRepositoryConfig;

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
// @ts-expect-error Kernel cannot write an original blob.
originals.put("original", new Uint8Array());
