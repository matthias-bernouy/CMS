import { describe, expect, test } from "bun:test";
import type { PublicPageProvider } from "@bernouy/cms-delivery";
import { mountPublicPages, publicPage } from "./publicPage.fixture";

describe("Delivery public page providers", () => {
    test("renders a provider page before the stored-page fallback using only the pathname", async () => {
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
        expect(response.headers.get("cache-control")).toBe("public, no-cache");
        expect(html).toContain("REMOTE_CATALOG");
        expect(html).not.toContain("STORED_PAGE");
        expect(paths).toEqual(["/integrations"]);
        expect(mounted.storedLookups).toEqual([]);
    });

    test("falls through providers in order and then preserves stored page behavior", async () => {
        const calls: string[] = [];
        const mounted = mountPublicPages({
            providers: [
                { resolvePage: async () => (calls.push("first"), null) },
                { resolvePage: async () => (calls.push("second"), null) },
            ],
            storedPages: [publicPage("stored", "/about", "<main>STORED_ABOUT</main>")],
        });

        const response = await mounted.get(new Request("https://example.test/about"));

        expect(response.status).toBe(200);
        expect(await response.text()).toContain("STORED_ABOUT");
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
        ] satisfies PublicPageProvider[]) {
            const mounted = mountPublicPages({ providers: [provider] });
            const response = await mounted.get(new Request("https://example.test/integrations"));
            expect(response.status).toBe(500);
            expect(await response.text()).not.toContain("internal upstream location");
            expect(mounted.storedLookups).toEqual([]);
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

    test("uses provider page identities for same-origin analytics referrers", async () => {
        const provider: PublicPageProvider = {
            resolvePage: async (path) =>
                path === "/integrations"
                    ? { page: publicPage("catalog", path), cacheIdentity: "catalog-v1" }
                    : path === "/integrations/example"
                      ? { page: publicPage("detail", path), cacheIdentity: "detail-v1" }
                      : null,
        };
        const mounted = mountPublicPages({ providers: [provider], analytics: true });

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

        expect(mounted.events[0]).toMatchObject({ pageId: "detail", previousPageId: "catalog" });
    });
});
