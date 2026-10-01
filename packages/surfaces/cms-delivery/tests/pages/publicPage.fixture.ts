import {
    createContentReader,
    CMS_CACHE_KEYS,
    type CmsRepository,
    type ContentReader,
    type TPage,
    type TSystem,
} from "@bernouy/cms-content";
import type { PublicPageProvider } from "@bernouy/cms-delivery";
import type { CmsFilesBlobStore } from "@bernouy/cms-content/files";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import { type CacheEntry, TtlCache } from "@bernouy/http-runner";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { componentJsCacheKey } from "cms-delivery/core/assets/buildComponent";
import { CaptureRunner } from "../gateway/support/CaptureRunner";

export function publicPage(id: string, path: string, content = `<p>${id}</p>`): TPage {
    return {
        id,
        path,
        content,
        title: id,
        description: `${id} description`,
        visible: true,
        tags: [],
    };
}

type HarnessOptions = Readonly<{
    providers?: readonly PublicPageProvider[];
    storedPages?: readonly TPage[];
    gateway?: GatewayInvoker;
    sitemapStore?: CmsFilesBlobStore;
    siteHost?: string;
    repository?: ContentReader | CmsRepository;
}>;

export function mountPublicPages(options: HarnessOptions = {}) {
    const runner = new CaptureRunner();
    const cache = new TtlCache();
    cache.set(
        componentJsCacheKey("/.cms/assets/component.js", { public: false, private: false }),
        cacheEntry("text/javascript"),
    );
    cache.set(CMS_CACHE_KEYS.js("/.cms/assets/cms-binding-core.js"), cacheEntry("text/javascript"));
    cache.set(CMS_CACHE_KEYS.STYLE, cacheEntry("text/css"));
    const storedPages = [...(options.storedPages ?? [])];
    const storedLookups: string[] = [];
    const repository: ContentReader = options.repository
        ? "resolvePublishedRoute" in options.repository
            ? options.repository
            : createContentReader(options.repository)
        : {
              getPublishedPage: async (path) => {
                  storedLookups.push(path);
                  return storedPages.find((page) => page.path === path) ?? null;
              },
              getPublishedPageById: async (id) => storedPages.find((page) => page.id === id) ?? null,
              getPublishedPages: async () => storedPages,
              resolvePublishedRoute: async () => null,
              getRenderableBlocs: async () => [],
              getBlocViewJS: async () => null,
              getRenderingSettings: async () =>
                  options.siteHost === undefined
                      ? SYSTEM
                      : { ...SYSTEM, site: { ...SYSTEM.site, host: options.siteHost } },
          };
    const delivery = new DeliveryCms({
        runner,
        repository,
        cache,
        publicPageProviders: options.providers,
        ...(options.gateway ? { capabilityGateway: { siteId: "site-test", invoker: options.gateway } } : {}),
        sitemapStore: options.sitemapStore,
    });
    return {
        delivery,
        get: runner.defaultHandler("GET", "/"),
        head: runner.defaultHandler("HEAD", "/"),
        storedLookups,
    };
}

function cacheEntry(contentType: string): CacheEntry {
    const bytes = new TextEncoder().encode("");
    return { raw: bytes, brotli: bytes, gzip: bytes, contentType, hash: "fixture" };
}

const SYSTEM: TSystem = {
    initializationStep: 1,
    site: {
        name: "Public pages",
        favicon: "",
        visible: true,
        host: "https://example.test",
        language: "en",
        theme: "",
        notFound: null,
        forbidden: null,
        serverError: null,
        login: null,
    },
    security: { connectExtras: [], mediaExtras: [] },
};
