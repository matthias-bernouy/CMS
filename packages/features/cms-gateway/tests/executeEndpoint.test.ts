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

    test("response headers: drops content-encoding + content-length (body is decompressed by fetch → would mismatch)", async () => {
        const fetchImpl = mock(async () => new Response("{\"ok\":true}", { status: 200, headers: {
            "content-type": "application/json", "content-encoding": "gzip", "content-length": "607",
        } }));
        const res = await executeEndpoint(ep(), new Request("http://local/x"), { fetchImpl });
        expect(res.headers.get("content-encoding")).toBeNull();
        expect(res.headers.get("content-length")).toBeNull();
        expect(res.headers.get("content-type")).toBe("application/json");
        expect(await res.text()).toBe("{\"ok\":true}");   // body readable, no decompression mismatch
    });

    test("missing required param → 400, no fetch", async () => {
        const fetchImpl = okFetch();
        const e = ep({ input: { params: [{ name: "lat", in: "query", required: true, schema: { type: "number" } }] } });
        const res = await executeEndpoint(e, new Request("http://local/x"), { fetchImpl });
        expect(res.status).toBe(400);
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("computed userID uses the configured context resolver", async () => {
        const fetchImpl = okFetch();
        const e = ep({ input: { params: [{
            name: "user_id",
            in: "query",
            required: true,
            source: { from: "computed", ref: "userID" },
            schema: { type: "string" },
        }] } });
        await executeEndpoint(e, new Request("http://local/x?user_id=evil"), {
            fetchImpl,
            resolveContext: async () => ({ userID: "user-123" }),
        });
        expect(fetchImpl.mock.calls[0]![0]).toBe("https://api.example.com/v1/items?user_id=user-123");
    });

    test("computed params without context resolver → 500, no fetch", async () => {
        const fetchImpl = okFetch();
        const e = ep({ input: { params: [{
            name: "user_id",
            in: "query",
            required: true,
            source: { from: "computed", ref: "userID" },
            schema: { type: "string" },
        }] } });
        const res = await executeEndpoint(e, new Request("http://local/x"), { fetchImpl });
        expect(res.status).toBe(500);
        expect(await res.text()).toBe("computed params require a configured context resolver");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("required computed userID absent → 401, no fetch", async () => {
        const fetchImpl = okFetch();
        const e = ep({ input: { params: [{
            name: "user_id",
            in: "query",
            required: true,
            source: { from: "computed", ref: "userID" },
            schema: { type: "string" },
        }] } });
        const res = await executeEndpoint(e, new Request("http://local/x"), {
            fetchImpl,
            resolveContext: async () => ({}),
        });
        expect(res.status).toBe(401);
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

    test("a secret config header WITHOUT resolveSecret → 500 seam, no fetch", async () => {
        const fetchImpl = okFetch();
        const e = ep({ headers: [{ name: "Authorization", source: { from: "secret", ref: "${STRIPE_KEY}" } }] });
        const res = await executeEndpoint(e, new Request("http://local/x"), { fetchImpl });
        expect(res.status).toBe(500);
        expect(await res.text()).toBe("secret header requires a configured secret store (not wired yet): Authorization");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("a secret config header WITH resolveSecret → resolved value forwarded upstream", async () => {
        const fetchImpl = okFetch();
        const resolveSecret = mock(async (_ref: string) => "sk_live_x");
        const e = ep({ headers: [{ name: "Authorization", source: { from: "secret", ref: "${STRIPE_KEY}" } }] });
        await executeEndpoint(e, new Request("http://local/x"), { fetchImpl, resolveSecret });
        expect(resolveSecret).toHaveBeenCalledWith("${STRIPE_KEY}");
        const passed = fetchImpl.mock.calls[0]![1]!.headers as Headers;
        expect(passed.get("authorization")).toBe("sk_live_x");
    });

    test("a secret config header prefix is applied after resolution", async () => {
        const fetchImpl = okFetch();
        const resolveSecret = mock(async (_ref: string) => "service-role-key");
        const e = ep({ headers: [{ name: "Authorization", source: { from: "secret", ref: "${SUPABASE_KEY}", prefix: "Bearer " } }] });
        await executeEndpoint(e, new Request("http://local/x"), { fetchImpl, resolveSecret });
        const passed = fetchImpl.mock.calls[0]![1]!.headers as Headers;
        expect(passed.get("authorization")).toBe("Bearer service-role-key");
    });

    test("a secret config header with resolveSecret returning undefined → 500, no fetch", async () => {
        const fetchImpl = okFetch();
        const resolveSecret = mock(async (_ref: string) => undefined);
        const e = ep({ headers: [{ name: "Authorization", source: { from: "secret", ref: "${MISSING}" } }] });
        const res = await executeEndpoint(e, new Request("http://local/x"), { fetchImpl, resolveSecret });
        expect(res.status).toBe(500);
        expect(await res.text()).toBe("secret not found: ${MISSING}");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("a computed config header uses the configured context resolver", async () => {
        const fetchImpl = okFetch();
        const e = ep({ headers: [{ name: "X-User-ID", source: { from: "computed", ref: "userID" } }] });
        await executeEndpoint(e, new Request("http://local/x"), {
            fetchImpl,
            resolveContext: async () => ({ userID: "user-123" }),
        });
        const passed = fetchImpl.mock.calls[0]![1]!.headers as Headers;
        expect(passed.get("x-user-id")).toBe("user-123");
    });

    test("a computed config header without context resolver → 500, no fetch", async () => {
        const fetchImpl = okFetch();
        const e = ep({ headers: [{ name: "X-User-ID", source: { from: "computed", ref: "userID" } }] });
        const res = await executeEndpoint(e, new Request("http://local/x"), { fetchImpl });
        expect(res.status).toBe(500);
        expect(await res.text()).toBe("computed headers require a configured context resolver");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    test("a computed config header with missing userID → 401, no fetch", async () => {
        const fetchImpl = okFetch();
        const e = ep({ headers: [{ name: "X-User-ID", source: { from: "computed", ref: "userID" } }] });
        const res = await executeEndpoint(e, new Request("http://local/x"), {
            fetchImpl,
            resolveContext: async () => ({}),
        });
        expect(res.status).toBe(401);
        expect(await res.text()).toBe('computed header unavailable: "X-User-ID"');
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
