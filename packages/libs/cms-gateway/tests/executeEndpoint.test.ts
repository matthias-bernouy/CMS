import { describe, test, expect, mock } from "bun:test";
import { executeEndpoint } from "cms-gateway/core/executeEndpoint";
import type { Endpoint } from "cms-gateway/interfaces/Gateway";

const ep = (over: Partial<Endpoint> = {}): Endpoint =>
    ({ urn: "urn:x:e", method: "GET", targetUrl: "https://api.example.com/v1/items", ...over });

const okFetch = () => mock(async (_i: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => new Response("ok"));

describe("executeEndpoint", () => {
    test("forwards to the built upstream URL with only declared query params", async () => {
        const fetchImpl = okFetch();
        const e = ep({ input: { params: [{ name: "lat", in: "query", required: true, schema: { type: "number" } }] } });
        await executeEndpoint(e, new Request("http://local/.cms/gateway/x/e?lat=48.8&evil=1"), { fetchImpl });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl.mock.calls[0]![0]).toBe("https://api.example.com/v1/items?lat=48.8");
    });

    test("request headers: forwards accept, strips cookie + authorization", async () => {
        const fetchImpl = okFetch();
        await executeEndpoint(ep(), new Request("http://local/x", { headers: {
            accept: "application/json", cookie: "cms-session=secret", authorization: "Bearer x",
        } }), { fetchImpl });
        const passed = fetchImpl.mock.calls[0]![1]!.headers as Headers;
        expect(passed.get("accept")).toBe("application/json");
        expect(passed.get("cookie")).toBeNull();
        expect(passed.get("authorization")).toBeNull();
    });

    test("response headers: drops set-cookie + access-control-*, keeps content-type, preserves status", async () => {
        const fetchImpl = mock(async () => new Response("body", { status: 201, headers: {
            "content-type": "application/json", "set-cookie": "a=b", "access-control-allow-origin": "*",
        } }));
        const res = await executeEndpoint(ep(), new Request("http://local/x"), { fetchImpl });
        expect(res.status).toBe(201);
        expect(res.headers.get("content-type")).toBe("application/json");
        expect(res.headers.get("set-cookie")).toBeNull();
        expect(res.headers.get("access-control-allow-origin")).toBeNull();
    });

    test("missing required param → 400, no fetch", async () => {
        const fetchImpl = okFetch();
        const e = ep({ input: { params: [{ name: "lat", in: "query", required: true, schema: { type: "number" } }] } });
        const res = await executeEndpoint(e, new Request("http://local/x"), { fetchImpl });
        expect(res.status).toBe(400);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("endpoint with NO headers proxies fine", async () => {
        const fetchImpl = okFetch();
        const res = await executeEndpoint(ep(), new Request("http://local/x"), { fetchImpl });
        expect(res.status).toBe(200);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test("a static config header is injected upstream", async () => {
        const fetchImpl = okFetch();
        const e = ep({ headers: [{ name: "X-Api-Version", source: { from: "static", value: "2024-01" } }] });
        await executeEndpoint(e, new Request("http://local/x"), { fetchImpl });
        const passed = fetchImpl.mock.calls[0]![1]!.headers as Headers;
        expect(passed.get("x-api-version")).toBe("2024-01");
    });

    test("a forbidden static header (host) is NOT forwarded", async () => {
        const fetchImpl = okFetch();
        const e = ep({ headers: [{ name: "Host", source: { from: "static", value: "evil.example.com" } }] });
        await executeEndpoint(e, new Request("http://local/x"), { fetchImpl });
        const passed = fetchImpl.mock.calls[0]![1]!.headers as Headers;
        expect(passed.get("host")).toBeNull();
    });

    test("a secret config header → 500, no fetch", async () => {
        const fetchImpl = okFetch();
        const e = ep({ headers: [{ name: "Authorization", source: { from: "secret", ref: "${STRIPE_KEY}" } }] });
        const res = await executeEndpoint(e, new Request("http://local/x"), { fetchImpl });
        expect(res.status).toBe(500);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("a static config header overrides a same-named allowlist header", async () => {
        const fetchImpl = okFetch();
        const e = ep({ headers: [{ name: "Accept", source: { from: "static", value: "application/xml" } }] });
        await executeEndpoint(e, new Request("http://local/x", { headers: { accept: "application/json" } }), { fetchImpl });
        const passed = fetchImpl.mock.calls[0]![1]!.headers as Headers;
        expect(passed.get("accept")).toBe("application/xml");
    });

    test("upstream throws → 502", async () => {
        const fetchImpl = mock(async () => { throw new Error("ECONNREFUSED"); });
        const res = await executeEndpoint(ep(), new Request("http://local/x"), { fetchImpl });
        expect(res.status).toBe(502);
    });

    test("streams the upstream body through", async () => {
        const fetchImpl = mock(async () => new Response("hello"));
        const res = await executeEndpoint(ep(), new Request("http://local/x"), { fetchImpl });
        expect(await res.text()).toBe("hello");
    });

    test("POST forwards the request body; GET never does", async () => {
        const postFetch = okFetch();
        await executeEndpoint(ep({ method: "POST" }), new Request("http://local/x", { method: "POST", body: "payload" }), { fetchImpl: postFetch });
        const postInit = postFetch.mock.calls[0]![1]! as RequestInit;
        expect(postInit.method).toBe("POST");
        expect(postInit.body).not.toBeUndefined();

        const getFetch = okFetch();
        await executeEndpoint(ep(), new Request("http://local/x"), { fetchImpl: getFetch });
        expect((getFetch.mock.calls[0]![1]! as RequestInit).body).toBeUndefined();
    });

    test("aborted/timed-out upstream → 504", async () => {
        const fetchImpl = mock(async () => { const e = new Error("aborted"); e.name = "AbortError"; throw e; });
        const res = await executeEndpoint(ep(), new Request("http://local/x"), { fetchImpl });
        expect(res.status).toBe(504);
    });
});
