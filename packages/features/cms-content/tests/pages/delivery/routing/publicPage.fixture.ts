import { satisfiesVersionRange } from "@bernouy/cms-repository/contracts/compatibility";
import type { GatewayHttpInvoker } from "@bernouy/cms-gateway/http";
import {
    createContentReader,
    CMS_CACHE_KEYS,
    type ContentRepository,
    type ContentReader,
    type TPage,
    type TSystem,
} from "@bernouy/cms-content";
import type { BlobStore } from "@bernouy/blob-store";
import type { GatewayActor } from "@bernouy/cms-gateway";
import { PageCapabilityAnalyzer } from "@bernouy/cms-content/public-delivery";
import { createSitemapService } from "@bernouy/cms-content/seo";
import { executeIndexingCapability } from "../support/indexing";
import { type CacheEntry, TtlCache } from "@bernouy/http-runner";
import EdgeCms from "../support/ContentHarness";
import type { ContentHarnessOptions as EdgeCmsConfig } from "../support/ContentHarness";
import { blocRuntimeCacheKey } from "@bernouy/cms-content/runtime-assets";
import { CaptureRunner } from "../support/CaptureRunner";
import { NOOP_LOGGER } from "@bernouy/logging";

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
    gateway?: Pick<GatewayHttpInvoker, "invoke">;
    sitemapStore?: BlobStore;
    siteHost?: string;
    repository?: ContentReader | ContentRepository;
    collections?: EdgeCmsConfig["collections"];
    resolveActor?: (request: Request) => Promise<GatewayActor>;
    editorialPages?: readonly TPage[];
    resolveEditorialRoute?: NonNullable<EdgeCmsConfig["editorialPages"]>["resolveRoute"];
    onEditorialLookup?: (path: string) => void;
    activeLanguages?: readonly string[];
    contentTexts?: readonly {
        namespace: string;
        resolve(locale: string): Readonly<Record<string, string>>;
    }[];
    pageCapabilities?: EdgeCmsConfig["pageCapabilities"];
}>;

export function mountPublicPages(options: HarnessOptions = {}) {
    const runner = new CaptureRunner();
    const cache = new TtlCache();
    cache.set(blocRuntimeCacheKey("/_content/assets/bloc-runtime.js"), cacheEntry("text/javascript"));
    cache.set(CMS_CACHE_KEYS.js("/_content/assets/cms-binding-core.js"), cacheEntry("text/javascript"));
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
                  storedLookups.push(path);
                  const page = storedPages.find((item) => item.path === path);
                  return page
                      ? page.visible
                          ? {
                                kind: "current",
                                page: renderable(page),
                                language: page.language ?? SYSTEM.site.language,
                            }
                          : { kind: "unavailable" }
                      : null;
              },
              getPublishedPageById: async (id) => storedPages.find((page) => page.id === id) ?? null,
              getPublishedPages: async () => storedPages,
              resolvePublishedRoute: async () => null,
              getRenderableBlocs: async () => [],
              getBlocViewJS: async () => null,
              getContentTexts: async () => [...(options.contentTexts ?? [])],
              getRenderingSettings: async () =>
                  options.siteHost === undefined && options.activeLanguages === undefined
                      ? SYSTEM
                      : {
                            ...SYSTEM,
                            site: {
                                ...SYSTEM.site,
                                ...(options.siteHost === undefined ? {} : { host: options.siteHost }),
                                ...(options.activeLanguages === undefined
                                    ? {}
                                    : { activeLanguages: [...options.activeLanguages] }),
                            },
                        },
          };
    const invoker = options.gateway
        ? ({
              resolveContract: async () => {
                  throw new Error("Page rendering must not resolve HTTP invocation bindings");
              },
              ...options.gateway,
          } as GatewayHttpInvoker)
        : undefined;
    const pageCapabilities =
        options.pageCapabilities ??
        (invoker
            ? new PageCapabilityAnalyzer({
                  satisfiesVersionRange,
                  resolveCapability: async () => ({ access: "public", version: "1.0.0" }),
              })
            : undefined);

    const edge = new EdgeCms({
        runner,
        content: repository,
        sitemapStore: options.sitemapStore,
        ...(options.editorialPages || options.resolveEditorialRoute
            ? {
                  editorialPages: {
                      resolveRoute:
                          options.resolveEditorialRoute ??
                          (async (path: string) => {
                              options.onEditorialLookup?.(path);
                              const page = options.editorialPages?.find((candidate) => candidate.path === path);
                              return page
                                  ? {
                                        page: renderable(page),
                                        language: page.language ?? SYSTEM.site.language,
                                    }
                                  : null;
                          }),
                  },
              }
            : {}),
        resolveActor: options.resolveActor ?? (async () => ({ kind: "anonymous" })),
        cache,
        collections: options.collections,
        ...(invoker || pageCapabilities
            ? {
                  ...(invoker
                      ? {
                            capabilityGateway: {
                                siteId: "site-test",
                                invoker,
                            },
                        }
                      : {}),
                  pageCapabilities,
              }
            : {}),
        logger: NOOP_LOGGER,
    });
    const sitemapService = options.sitemapStore
        ? createSitemapService({
              store: options.sitemapStore,
              content: repository,
              sitemapStore: options.sitemapStore,
              listAdditionalPaths: async () => [],
              isReservedPath: (path) =>
                  path === "/robots.txt" ||
                  path === "/sitemap.xml" ||
                  path === "/favicon.ico" ||
                  path === "/.cms" ||
                  path.startsWith("/.cms/"),
              execute: (contractId, capabilityId, input) =>
                  executeIndexingCapability(
                      edge.capabilityGateway,
                      { kind: "anonymous" },
                      contractId,
                      capabilityId,
                      input,
                  ),
          })
        : null;
    return {
        edge,
        sitemapService,
        get: runner.defaultHandler("GET", "/"),
        head: runner.defaultHandler("HEAD", "/"),
        sitemap: runner.endpointHandler("GET", "/sitemap.xml"),
        storedLookups,
    };
}

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
        notFound: null,
        forbidden: null,
        serverError: null,
        login: null,
    },
    theme: {
        activeThemeId: "default",
        sources: [],
        themes: [{ id: "default", name: "Default", values: { light: {}, dark: {} } }],
    },
};
