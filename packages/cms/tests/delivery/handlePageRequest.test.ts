import { describe, test, expect } from "bun:test";
import { handlePageRequest } from "src/delivery/core/pages/handlePageRequest";
import { makeDelivery, page, testRepository } from "./helpers";

function req(url: string): Request {
    return new Request(url);
}

describe("handlePageRequest — short-circuit under /.cms/*", () => {
    test("returns 404 for any path equal to the cmsPathPrefix itself", async () => {
        const delivery = makeDelivery();
        const res = await handlePageRequest(req("http://localhost/.cms"), delivery);
        expect(res.status).toBe(404);
    });

    test("returns 404 for unknown paths under the asset prefix without hitting the repo", async () => {
        let called = false;
        const delivery = makeDelivery({
            repository: {
                ...testRepository(),
                getPage: async () => { called = true; return null; },
            },
        });
        const res = await handlePageRequest(req("http://localhost/.cms/unknown-asset"), delivery);
        expect(res.status).toBe(404);
        expect(called).toBe(false);
    });

    test("the short-circuit scopes to the tenant prefix when basePath is set", async () => {
        const delivery = makeDelivery({ basePath: "/tenant-1" });
        const res = await handlePageRequest(req("http://localhost/tenant-1/.cms/unknown"), delivery);
        expect(res.status).toBe(404);
    });
});

describe("handlePageRequest — page resolution", () => {
    test("serves the matching page when one exists at the URL path", async () => {
        const delivery = makeDelivery({
            repository: testRepository({
                pages: [page({ path: "/about", content: "<p>about body</p>" })],
            }),
        });
        const res = await handlePageRequest(req("http://localhost/about"), delivery);
        expect(res.status).toBe(200);
        expect(await res.text()).toContain("about body");
    });

    test("returns plain-text 404 when no page matches and no notFound is configured", async () => {
        const delivery = makeDelivery({ repository: testRepository({ pages: [] }) });
        const res = await handlePageRequest(req("http://localhost/missing"), delivery);
        expect(res.status).toBe(404);
        expect(await res.text()).toBe("Page not found");
    });

    test("falls back to the configured site.notFound page when one is set", async () => {
        const delivery = makeDelivery({
            repository: testRepository({
                pages: [page({ path: "/404", content: "<p>custom 404</p>" })],
                notFound: { path: "/404" },
            }),
        });
        const res = await handlePageRequest(req("http://localhost/missing"), delivery);
        expect(res.status).toBe(404);
        expect(await res.text()).toContain("custom 404");
    });
});

describe("handlePageRequest — enhancement timing", () => {
    test("cold cache: blocks on enhancer.enhance before returning", async () => {
        let enhanceCalled = 0;
        const delivery = makeDelivery({
            repository: testRepository({
                pages: [page({ path: "/about" })],
            }),
            enhancer: { enhance: async () => { enhanceCalled++; } },
        });
        await handlePageRequest(req("http://localhost/about"), delivery);
        expect(enhanceCalled).toBe(1);
    });

    test("warm cache: does NOT call enhancer (already enhanced)", async () => {
        let enhanceCalled = 0;
        const delivery = makeDelivery({
            repository: testRepository({
                pages: [page({ path: "/about" })],
            }),
            enhancer: { enhance: async () => { enhanceCalled++; } },
        });
        // First request: populates cache + triggers enhancement
        await handlePageRequest(req("http://localhost/about"), delivery);
        // Second request: cache hit → enhancer untouched
        await handlePageRequest(req("http://localhost/about"), delivery);
        expect(enhanceCalled).toBe(1);
    });
});
