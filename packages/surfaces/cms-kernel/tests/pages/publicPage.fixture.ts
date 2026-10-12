import {
    createContentReader,
    CMS_CACHE_KEYS,
    type CmsRepository,
    type ContentReader,
    type TPage,
    type TSystem,
} from "@bernouy/cms-content";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import type { BlobStore } from "@bernouy/blob-store";
import type { GatewayInvoker } from "@bernouy/cms-gateway";
import { PageExecutionService, type PageExecutionAuthority } from "@bernouy/cms-gateway/execution";
import { createSitemapService, executeIndexingCapability } from "@bernouy/cms-seo";
import { type CacheEntry, TtlCache } from "@bernouy/http-runner";
import KernelCms from "cms-kernel/KernelCms";
import type { KernelCmsConfig } from "cms-kernel/KernelCmsConfig";
import { componentRuntimeCacheKey } from "@bernouy/cms-content/runtime-assets";
import { CaptureRunner } from "../gateway/support/CaptureRunner";

export function publicPage(id: string, path: string, content = `<p>${id}</p>`): TPage {
    return {
        id,
        revision: 1,
        path,
        content,
        title: id,
        description: `${id} description`,
        visible: true,
        tags: [],
    };
}

type HarnessOptions = Readonly<{
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
    cache.set(componentRuntimeCacheKey("/.cms/assets/component.js"), cacheEntry("text/javascript"));
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
              getRenderablePage: async (path) => {
                  storedLookups.push(path);
                  const page = storedPages.find((item) => item.path === path);
                  return page ? renderable(page) : null;
              },
              getRenderablePages: async () => storedPages.map(renderable),
              resolvePageReference: async (reference) =>
                  storedPages.find((page) => reference.kind === "site" && page.id === reference.pageId)?.path ?? null,
              resolveRenderableRoute: async (path) => {
                  const page = storedPages.find((item) => item.path === path);
                  return page
                      ? {
                            kind: "current",
                            page: renderable(page),
                            language: page.language ?? SYSTEM.site.language,
                        }
                      : null;
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
    const pageExecution = invoker
        ? new PageExecutionService({
              siteId: "site-test",
              content: repository,
              invoker,
              authority: unusedAuthority,
              resolveCapability: async () => ({ access: "public", version: "1.0.0" }),
          })
        : undefined;
    const kernel = new KernelCms({
        runner,
        content: repository,
        authentication: new InMemoryAuthentication(),
        cache,
        collections: options.collections,
        ...(invoker
            ? {
                  capabilityGateway: {
                      siteId: "site-test",
                      invoker,
                      isAdministrator: async () => false,
                  },
                  pageExecution,
              }
            : {}),
        sitemapStore: options.sitemapStore,
    });
    const sitemapService = options.sitemapStore
        ? createSitemapService({
              store: options.sitemapStore,
              content: repository,
              listAdditionalPaths: async () => [],
              isReservedPath: (path) =>
                  path === "/robots.txt" ||
                  path === "/sitemap.xml" ||
                  path === "/favicon.ico" ||
                  path === "/.cms" ||
                  path.startsWith("/.cms/"),
              execute: (contractId, capabilityId, input) =>
                  executeIndexingCapability(
                      kernel.capabilityGateway,
                      { kind: "anonymous" },
                      contractId,
                      capabilityId,
                      input,
                  ),
          })
        : null;
    return {
        kernel,
        sitemapService,
        get: runner.defaultHandler("GET", "/"),
        head: runner.defaultHandler("HEAD", "/"),
        sitemap: runner.endpointHandler("GET", "/sitemap.xml"),
        storedLookups,
    };
}

const unusedAuthority: PageExecutionAuthority = {
    activate: async () => {
        throw new Error("not used by the public Page fixture");
    },
    authorize: async () => {
        throw new Error("not used by the public Page fixture");
    },
};

function renderable(page: TPage) {
    return {
        reference: { kind: "site" as const, pageId: page.id },
        page,
        source: { kind: "site" as const, pageId: page.id, revision: page.revision },
        requirements: [],
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
