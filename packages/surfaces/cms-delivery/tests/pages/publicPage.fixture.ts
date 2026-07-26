import type { AnalyticsEvent } from "@bernouy/cms-analytics";
import { P9R_CACHE, type ContentReader, type TPage, type TSystem } from "@bernouy/cms-content";
import type { PublicPageProvider } from "@bernouy/cms-delivery";
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
    analytics?: boolean;
}>;

export function mountPublicPages(options: HarnessOptions = {}) {
    const runner = new CaptureRunner();
    const cache = new TtlCache();
    cache.set(
        componentJsCacheKey("/.cms/assets/component.js", { public: false, private: false }),
        cacheEntry("text/javascript"),
    );
    cache.set(P9R_CACHE.js("/.cms/assets/cms-binding-core.js"), cacheEntry("text/javascript"));
    cache.set(P9R_CACHE.STYLE, cacheEntry("text/css"));
    const storedPages = [...(options.storedPages ?? [])];
    const storedLookups: string[] = [];
    const events: AnalyticsEvent[] = [];
    let notifyRecorded: (() => void) | undefined;
    const recorded = new Promise<void>((resolve) => {
        notifyRecorded = resolve;
    });
    const repository: ContentReader = {
        getPage: async (path) => storedPages.find((page) => page.path === path) ?? null,
        getAllPages: async () => storedPages,
        getPublishedPage: async (path) => {
            storedLookups.push(path);
            return storedPages.find((page) => page.path === path) ?? null;
        },
        getPublishedPages: async () => storedPages,
        getBlocsList: async () => [],
        getBlocViewJS: async () => null,
        getSystem: async () => SYSTEM,
    };
    const delivery = new DeliveryCms({
        runner,
        repository,
        cache,
        publicPageProviders: options.providers,
        analytics: options.analytics
            ? ({
                  getSettings: async () => ({
                      enabled: true,
                      visitorEstimation: false,
                      rollupRetentionDays: 395,
                      privacyNoticeUrl: "",
                  }),
                  record: async (event: AnalyticsEvent) => {
                      events.push(event);
                      notifyRecorded?.();
                  },
              } as never)
            : undefined,
        analyticsVisitorSecret: "test-secret",
        analyticsSiteScope: "https://example.test",
    });
    return {
        delivery,
        events,
        get: runner.defaultHandler("GET", "/"),
        head: runner.defaultHandler("HEAD", "/"),
        recorded,
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
        host: "example.test",
        language: "en",
        theme: "",
        notFound: null,
        forbidden: null,
        serverError: null,
        login: null,
    },
    editor: { layoutCategory: "" },
    security: { connectExtras: [], mediaExtras: [] },
};
