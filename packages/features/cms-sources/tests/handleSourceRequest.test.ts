import { describe, test, expect, mock } from "bun:test";
import { handleSourceRequest } from "cms-sources/http/handleSourceRequest";
import { InMemorySourceRepository } from "cms-sources/default-implementation/InMemorySourceRepository";
import { CompositeSourceRepository } from "cms-sources/core/CompositeSourceRepository";
import { SYSTEM_AUTH_SOURCE } from "cms-sources/core/systemSources";
import type { Source } from "cms-sources/interfaces/Source";

const PREFIX = "/base/.cms/sources/";

const source: Source = {
    urn: "urn:shop",
    endpoints: [
        { urn: "urn:shop:getCart", method: "GET", targetUrl: "https://api.shop.com/cart" },
    ],
};

async function seededRepo() {
    const r = new InMemorySourceRepository();
    await r.createSource(source);
    return r;
}

const okFetch = () => mock(async (_i: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => new Response("ok"));

describe("handleSourceRequest", () => {
    test("null source → 501", async () => {
        const res = await handleSourceRequest(null, new Request("http://local" + PREFIX + "shop/getCart"), { prefix: PREFIX });
        expect(res.status).toBe(501);
        expect(await res.text()).toBe("data source not configured");
    });

    test("path not under prefix → 404", async () => {
        const res = await handleSourceRequest(await seededRepo(), new Request("http://local/elsewhere/shop/getCart"), { prefix: PREFIX });
        expect(res.status).toBe(404);
        expect(await res.text()).toBe("Not Found");
    });

    test("unknown source/endpoint → 404", async () => {
        const res = await handleSourceRequest(await seededRepo(), new Request("http://local" + PREFIX + "shop/nope"), { prefix: PREFIX });
        expect(res.status).toBe(404);
        expect(await res.text()).toBe("not_found");
    });

    test("method mismatch → 405", async () => {
        const res = await handleSourceRequest(await seededRepo(), new Request("http://local" + PREFIX + "shop/getCart", { method: "POST" }), { prefix: PREFIX });
        expect(res.status).toBe(405);
        expect(await res.text()).toBe("method_not_allowed");
    });

    test("a valid request is proxied upstream via deps.fetchImpl", async () => {
        const fetchImpl = okFetch();
        const res = await handleSourceRequest(await seededRepo(), new Request("http://local" + PREFIX + "shop/getCart"), { prefix: PREFIX, deps: { fetchImpl } });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0]![0]).toBe("https://api.shop.com/cart");
        expect(res.status).toBe(200);
        expect(await res.text()).toBe("ok");
    });

    test("a denied endpoint grant returns 403 without proxying upstream", async () => {
        const fetchImpl = okFetch();
        const authorizeEndpoint = mock(async () => false);

        const res = await handleSourceRequest(
            await seededRepo(),
            new Request("http://local" + PREFIX + "shop/getCart"),
            { prefix: PREFIX, deps: { fetchImpl, authorizeEndpoint } },
        );

        expect(res.status).toBe(403);
        expect(await res.text()).toBe("Forbidden");
        expect(authorizeEndpoint).toHaveBeenCalledTimes(1);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("an allowed endpoint grant proxies upstream", async () => {
        const fetchImpl = okFetch();
        const authorizeEndpoint = mock(async (endpoint: { urn: string }) => endpoint.urn === "urn:shop:getCart");

        const res = await handleSourceRequest(
            await seededRepo(),
            new Request("http://local" + PREFIX + "shop/getCart"),
            { prefix: PREFIX, deps: { fetchImpl, authorizeEndpoint } },
        );

        expect(res.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test("system endpoints require a system executor", async () => {
        const repo = new CompositeSourceRepository(new InMemorySourceRepository(), [SYSTEM_AUTH_SOURCE]);
        const res = await handleSourceRequest(repo, new Request("http://local" + PREFIX + "system-auth/me"), { prefix: PREFIX });
        expect(res.status).toBe(501);
        expect(await res.text()).toBe("system source executor not configured");
    });

    test("system endpoints delegate without proxying upstream", async () => {
        const repo = new CompositeSourceRepository(new InMemorySourceRepository(), [SYSTEM_AUTH_SOURCE]);
        const executeSystemEndpoint = mock(async (_endpoint, req: Request) =>
            new Response(req.headers.get("cookie") ?? "missing"));
        const fetchImpl = okFetch();

        const res = await handleSourceRequest(
            repo,
            new Request("http://local" + PREFIX + "system-auth/me", { headers: { cookie: "site-session=abc" } }),
            { prefix: PREFIX, deps: { executeSystemEndpoint, fetchImpl } },
        );

        expect(executeSystemEndpoint).toHaveBeenCalledTimes(1);
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(await res.text()).toBe("site-session=abc");
    });

    test("system endpoints are authorized before the system executor runs", async () => {
        const repo = new CompositeSourceRepository(new InMemorySourceRepository(), [SYSTEM_AUTH_SOURCE]);
        const executeSystemEndpoint = mock(async () => new Response("system"));
        const authorizeEndpoint = mock(async () => false);

        const res = await handleSourceRequest(
            repo,
            new Request("http://local" + PREFIX + "system-auth/me"),
            { prefix: PREFIX, deps: { executeSystemEndpoint, authorizeEndpoint } },
        );

        expect(res.status).toBe(403);
        expect(executeSystemEndpoint).not.toHaveBeenCalled();
    });
});
