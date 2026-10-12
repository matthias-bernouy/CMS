import {
    createContentReader,
    CMS_CACHE_KEYS,
    type CmsRepository,
    type ContentReader,
    type TPage,
    type TSystem,
} from "@bernouy/cms-content";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import type { PublicPageProvider } from "@bernouy/cms-kernel";
import type { BlobStore } from "@bernouy/blob-store";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import { type CacheEntry, TtlCache } from "@bernouy/http-runner";
import KernelCms from "cms-kernel/KernelCms";
import type { KernelCmsConfig } from "cms-kernel/interfaces/KernelCmsConfig";
import { componentJsCacheKey } from "cms-kernel/core/assets/buildComponent";
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
    sitemapStore?: BlobStore;
    siteHost?: string;
    repository?: ContentReader | CmsRepository;
    collections?: KernelCmsConfig["collections"];
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
        ? "getSystem" in options.repository
            ? createContentReader(options.repository)
            : options.repository
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
    const invoker = options.gateway
        ? ({
              resolveHttp: async ({ path }: { path: string }) => ({
                  capability: { id: path.split("/").filter(Boolean).at(-1) ?? "unknown" },
                  binding: {},
                  pathValues: {},
              }),
              ...options.gateway,
          } as GatewayInvoker)
        : undefined;
    const kernel = new KernelCms({
        runner,
        repository:
            options.repository && "getSystem" in options.repository
                ? options.repository
                : writableRepository(repository),
        authentication: new InMemoryAuthentication(),
        cache,
        publicPageProviders: options.providers,
        collections: options.collections,
        ...(invoker
            ? {
                  capabilityGateway: {
                      siteId: "site-test",
                      invoker,
                      resolveCapabilityAccess: async () => "public" as const,
                      isAdministrator: async () => false,
                  },
              }
            : {}),
        sitemapStore: options.sitemapStore,
    });
    return {
        kernel,
        get: runner.defaultHandler("GET", "/"),
        head: runner.defaultHandler("HEAD", "/"),
        storedLookups,
    };
}

function writableRepository(reader: ContentReader): CmsRepository {
    return {
        ...reader,
        getSystem: reader.getRenderingSettings,
        getPageRoute: async () => null,
        getBlocsList: reader.getRenderableBlocs,
    } as unknown as CmsRepository;
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
