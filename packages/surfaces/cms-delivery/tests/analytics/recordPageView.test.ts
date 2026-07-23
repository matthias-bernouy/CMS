import { describe, expect, test } from "bun:test";
import type { AnalyticsEvent } from "@bernouy/cms-analytics";
import { P9R_CACHE, type TPage } from "@bernouy/cms-content";
import { TtlCache, type CacheEntry } from "@bernouy/http-runner";
import DeliveryCms from "cms-delivery/DeliveryCms";
import { CaptureRunner } from "../gateway/support/CaptureRunner";
import { analyticsOptOutCookieName } from "cms-delivery/core/analytics/privacyPreference";

const page = (id: string, path: string): TPage => ({
    id,
    path,
    content: "",
    title: id,
    description: "",
    visible: true,
    tags: [],
});

function cachedHtml(): CacheEntry {
    const bytes = new TextEncoder().encode("<!doctype html><html></html>");
    return { raw: bytes, brotli: bytes, gzip: bytes, contentType: "text/html", hash: "hash" };
}

function mount(pages: TPage[], settings = { enabled: true, visitorEstimation: true }) {
    const runner = new CaptureRunner();
    const cache = new TtlCache();
    for (const item of pages) {
        cache.set(P9R_CACHE.page(item.path), cachedHtml());
    }
    const events: AnalyticsEvent[] = [];
    let resolveRecorded: (() => void) | undefined;
    const recorded = () => new Promise<void>((resolve) => (resolveRecorded = resolve));
    new DeliveryCms({
        runner,
        cache,
        repository: {
            getPublishedPage: async (path: string) => pages.find((item) => item.path === path) ?? null,
            getSystem: async () => ({ site: { notFound: null } }),
        } as never,
        analytics: {
            getSettings: async () => ({
                ...settings,
                rollupRetentionDays: 395,
                privacyNoticeUrl: "",
            }),
            record: async (event: AnalyticsEvent) => {
                events.push(event);
                resolveRecorded?.();
            },
        } as never,
        analyticsVisitorSecret: "shared-secret",
        analyticsSiteScope: "https://example.test",
    });
    return { handler: runner.defaultHandler("GET", "/"), events, recorded };
}

describe("Delivery strict analytics collection", () => {
    test("records resolved HTML by page id and resolves a safe predecessor id", async () => {
        const mounted = mount([page("home", "/"), page("about", "/about")]);
        const done = mounted.recorded();
        const response = await mounted.handler(
            new Request("https://example.test/about?utm_campaign=ignored", {
                headers: {
                    host: "example.test",
                    referer: "https://example.test/",
                    "user-agent": "Mozilla/5.0 Chrome/120 Safari/537.36",
                },
            }),
        );
        await done;
        expect(response.status).toBe(200);
        expect(mounted.events[0]).toMatchObject({
            pageId: "about",
            previousPageId: "home",
            entry: false,
            contentKind: "html",
        });
        expect(JSON.stringify(mounted.events[0])).not.toContain("utm_campaign");
    });

    test("keeps unmatched scanner paths out of every stored dimension", async () => {
        const mounted = mount([]);
        const done = mounted.recorded();
        await mounted.handler(
            new Request("https://example.test/.env-secret", {
                headers: { host: "example.test", "user-agent": "Mozilla/5.0 Chrome/120 Safari/537.36" },
            }),
        );
        await done;
        expect(mounted.events[0]).toMatchObject({ status: 404, contentKind: "other" });
        expect(mounted.events[0]).not.toHaveProperty("pageId");
        expect(JSON.stringify(mounted.events[0])).not.toContain(".env-secret");
    });

    test("classifies automation before constructing visitor input", async () => {
        const mounted = mount([page("home", "/")]);
        const done = mounted.recorded();
        await mounted.handler(
            new Request("https://example.test/", {
                headers: { host: "example.test", "user-agent": "curl/8.8" },
            }),
        );
        await done;
        expect(mounted.events[0]).toMatchObject({ exclusionReason: "automation" });
        expect(mounted.events[0]).not.toHaveProperty("visitorHash");
    });

    test("opt-out prevents event construction and store invocation", async () => {
        const mounted = mount([page("home", "/")]);
        const cookie = analyticsOptOutCookieName("https://example.test");
        await mounted.handler(
            new Request("https://example.test/", {
                headers: {
                    host: "example.test",
                    "user-agent": "Mozilla/5.0 Chrome/120 Safari/537.36",
                    cookie: `${cookie}=1`,
                },
            }),
        );
        expect(mounted.events).toEqual([]);
    });

    test("runtime settings can disable all collection or only visitor estimation", async () => {
        const disabled = mount([page("home", "/")], { enabled: false, visitorEstimation: true });
        await disabled.handler(
            new Request("https://example.test/", {
                headers: { host: "example.test", "user-agent": "Mozilla/5.0 Chrome/120 Safari/537.36" },
            }),
        );
        expect(disabled.events).toEqual([]);

        const countersOnly = mount([page("home", "/")], { enabled: true, visitorEstimation: false });
        const done = countersOnly.recorded();
        await countersOnly.handler(
            new Request("https://example.test/", {
                headers: { host: "example.test", "user-agent": "Mozilla/5.0 Chrome/120 Safari/537.36" },
            }),
        );
        await done;
        expect(countersOnly.events[0]).not.toHaveProperty("visitorHash");
    });
});
