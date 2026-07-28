import { describe, expect, test } from "bun:test";
import type { PublicPageProvider } from "@bernouy/cms-delivery";
import { mountPublicPages, publicPage } from "./publicPage.fixture";

describe("Delivery public page providers", () => {
    test("renders a published CMS page before the provider fallback", async () => {
        const paths: string[] = [];
        const provider: PublicPageProvider = {
            resolvePage: async (path) => {
                paths.push(path);
                return {
                    page: publicPage("catalog", path, "<main>REMOTE_CATALOG</main>"),
                    cacheIdentity: "catalog-v1",
                };
            },
        };
        const mounted = mountPublicPages({
            providers: [provider],
            storedPages: [publicPage("stored", "/integrations", "<main>STORED_PAGE</main>")],
        });

        const response = await mounted.get(new Request("https://example.test/integrations?q=commerce"));
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(html).toContain("STORED_PAGE");
        expect(html).not.toContain("REMOTE_CATALOG");
        expect(paths).toEqual([]);
        expect(mounted.storedLookups).toEqual(["/integrations"]);
    });

    test("uses a provider with bounded query values when no published CMS page exists", async () => {
        const queries: Array<Readonly<Record<string, readonly string[]>>> = [];
        const mounted = mountPublicPages({
            providers: [
                {
                    resolvePage: async (path, context) => {
                        queries.push(context.searchParams);
                        return {
                            page: publicPage("catalog", path, "<main>REMOTE_CATALOG</main>"),
                            cacheIdentity: "catalog-v1",
                        };
                    },
                },
            ],
        });

        const response = await mounted.get(new Request("https://example.test/integrations?q=commerce"));

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(await response.text()).toContain("REMOTE_CATALOG");
        expect(queries).toEqual([{ q: ["commerce"] }]);
        expect(Object.isFrozen(queries[0])).toBe(true);
        expect(Object.isFrozen(queries[0]?.q)).toBe(true);
        expect(mounted.storedLookups).toEqual(["/integrations"]);
    });

    test("falls through providers in order after a stored-page miss", async () => {
        const calls: string[] = [];
        const mounted = mountPublicPages({
            providers: [
                { resolvePage: async () => (calls.push("first"), null) },
                { resolvePage: async () => (calls.push("second"), null) },
            ],
        });

        const response = await mounted.get(new Request("https://example.test/about"));

        expect(response.status).toBe(404);
        expect(calls).toEqual(["first", "second"]);
        expect(mounted.storedLookups).toEqual(["/about"]);
    });

    test("uses no-store without an identity and keeps identified output isolated", async () => {
        let unversioned = 0;
        const uncached = mountPublicPages({
            providers: [
                {
                    resolvePage: async (path) => ({
                        page: publicPage("live", path, `<main>LIVE_${++unversioned}</main>`),
                    }),
                },
            ],
        });
        const firstLive = await uncached.get(new Request("https://example.test/live"));
        const secondLive = await uncached.get(new Request("https://example.test/live"));
        expect(firstLive.headers.get("cache-control")).toBe("no-store");
        expect(await firstLive.text()).toContain("LIVE_1");
        expect(await secondLive.text()).toContain("LIVE_2");

        let identified = 0;
        const cached = mountPublicPages({
            providers: [
                {
                    resolvePage: async (path) => ({
                        page: publicPage("versioned", path, `<main>IDENTIFIED_${++identified}</main>`),
                        cacheIdentity: "same-version",
                    }),
                },
            ],
        });
        const firstCached = await cached.get(new Request("https://example.test/versioned"));
        const secondCached = await cached.get(new Request("https://example.test/versioned"));
        expect(await firstCached.text()).toContain("IDENTIFIED_1");
        expect(await secondCached.text()).toContain("IDENTIFIED_1");
    });

    test("turns provider failures and invalid results into explicit server errors", async () => {
        for (const provider of [
            { resolvePage: async () => Promise.reject(new Error("internal upstream location")) },
            {
                resolvePage: async () => ({
                    page: publicPage("wrong", "/different"),
                    cacheIdentity: "valid",
                }),
            },
            {
                resolvePage: async (path: string) => ({
                    page: publicPage("bad-cache", path),
                    cacheIdentity: "",
                }),
            },
            {
                resolvePage: async (path: string) => ({
                    page: publicPage("non-string-cache", path),
                    cacheIdentity: 123 as never,
                }),
            },
            {
                resolvePage: async (path: string) => ({
                    page: publicPage("invalid-status", path),
                    status: 302,
                }),
            },
            {
                resolvePage: async (path: string) => ({
                    page: publicPage("cached-error", path),
                    status: 503,
                    cacheIdentity: "invalid-error-cache",
                }),
            },
        ] satisfies PublicPageProvider[]) {
            const mounted = mountPublicPages({ providers: [provider] });
            const response = await mounted.get(new Request("https://example.test/integrations"));
            expect(response.status).toBe(500);
            expect(await response.text()).not.toContain("internal upstream location");
            expect(mounted.storedLookups).toEqual(["/integrations"]);
        }
    });

    test("returns bodyless HEAD responses and keeps unknown paths as CMS 404s", async () => {
        const mounted = mountPublicPages({
            providers: [
                {
                    resolvePage: async (path) =>
                        path === "/integrations"
                            ? { page: publicPage("catalog", path), cacheIdentity: "catalog-v1" }
                            : null,
                },
            ],
        });

        const head = await mounted.head(new Request("https://example.test/integrations", { method: "HEAD" }));
        expect(head.status).toBe(200);
        expect(await head.text()).toBe("");
        expect(head.headers.get("etag")).not.toBeNull();

        const missing = await mounted.get(new Request("https://example.test/missing"));
        expect(missing.status).toBe(404);
    });

    test("uses stored page identities before provider identities for same-origin analytics referrers", async () => {
        const provider: PublicPageProvider = {
            resolvePage: async (path) =>
                path === "/integrations"
                    ? { page: publicPage("catalog", path), cacheIdentity: "catalog-v1" }
                    : path === "/integrations/example"
                      ? { page: publicPage("detail", path), cacheIdentity: "detail-v1" }
                      : null,
        };
        const mounted = mountPublicPages({
            providers: [provider],
            storedPages: [
                publicPage("stored-catalog", "/integrations"),
                publicPage("stored-detail", "/integrations/example"),
            ],
            analytics: true,
        });

        await mounted.get(
            new Request("https://example.test/integrations/example", {
                headers: {
                    host: "example.test",
                    referer: "https://example.test/integrations",
                    "user-agent": "Mozilla/5.0 Chrome/120 Safari/537.36",
                },
            }),
        );
        await mounted.recorded;

        expect(mounted.events[0]).toMatchObject({ pageId: "stored-detail", previousPageId: "stored-catalog" });
    });
});
