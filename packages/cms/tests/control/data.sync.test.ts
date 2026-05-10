import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import postDataProviderSync from "src/control/api/data/sync.post";
import type { TDataProvider } from "src/socle/interfaces/Data/data";

const baseProvider: TDataProvider = {
    id:         "hub",
    source:     "url",
    sourceUrl:  "https://hub.bernouy.fr/openapi.json",
    server:     "",
    spec:       "",
    specAuth:   { type: "none" },
    rules:      { paths: {} },
    secrets:    {},
    createdAt:  new Date(0),
    lastSyncAt: null,
};

function makeSystem(provider: TDataProvider | null = baseProvider) {
    const updates:    { id: string; data: Partial<TDataProvider> }[] = [];
    const invalidated: string[] = [];
    const cms: any = {
        repository: {
            getDataProvider:    async () => provider ? { ...provider } : null,
            updateDataProvider: async (id: string, data: Partial<TDataProvider>) => {
                updates.push({ id, data });
                return provider ? { ...provider, ...data } : null;
            },
        },
        specCache: { delete: (id: string) => { invalidated.push(id); } },
    };
    return { cms, updates, invalidated };
}

function makeRequest(id: string | null) {
    const url = id === null
        ? "http://localhost/cms/api/data/sync"
        : `http://localhost/cms/api/data/sync?id=${id}`;
    return new Request(url, { method: "POST" });
}

const realFetch = globalThis.fetch;
let fetchImpl: ((url: string, init: RequestInit) => Promise<Response>) | null = null;

beforeEach(() => {
    globalThis.fetch = ((url: string, init: RequestInit) => {
        if (!fetchImpl) throw new Error("fetch not stubbed for this test");
        return fetchImpl(url, init);
    }) as any;
});
afterEach(() => {
    globalThis.fetch = realFetch;
    fetchImpl = null;
});

describe("POST /api/data/sync", () => {
    test("400 when id is missing", async () => {
        const { cms } = makeSystem();
        const res = await postDataProviderSync(makeRequest(null), cms);
        expect(res.status).toBe(400);
    });

    test("404 when provider does not exist", async () => {
        const { cms } = makeSystem(null);
        const res = await postDataProviderSync(makeRequest("missing"), cms);
        expect(res.status).toBe(404);
    });

    test("happy path: stores spec, bumps lastSyncAt, reports endpointCount", async () => {
        fetchImpl = async () => new Response(
            JSON.stringify({ openapi: "3.0.0", paths: { "/users": {}, "/users/{id}": {}, "/posts": {} } }),
            { status: 200, headers: { "Content-Type": "application/json" } },
        );
        const { cms, updates } = makeSystem();
        const res = await postDataProviderSync(makeRequest("hub"), cms);
        expect(res.ok).toBe(true);
        const body = await res.json() as { ok: boolean; endpointCount: number };
        expect(body).toEqual({ ok: true, endpointCount: 3 });
        expect(updates).toHaveLength(1);
        expect(updates[0]?.data.spec).toContain('"openapi":"3.0.0"');
        expect(updates[0]?.data.lastSyncAt).toBeInstanceOf(Date);
    });

    test("non-2xx response: reports HTTP error with 502 + structured body", async () => {
        fetchImpl = async () => new Response("nope", { status: 401, statusText: "Unauthorized" });
        const { cms, updates } = makeSystem();
        const res = await postDataProviderSync(makeRequest("hub"), cms);
        expect(res.status).toBe(502);
        const body = await res.json() as { ok: boolean; error: string };
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/401/);
        expect(updates).toHaveLength(0);
    });

    test("network error: reports error with 502", async () => {
        fetchImpl = async () => { throw new TypeError("Failed to fetch"); };
        const { cms, updates } = makeSystem();
        const res = await postDataProviderSync(makeRequest("hub"), cms);
        expect(res.status).toBe(502);
        const body = await res.json() as { ok: boolean; error: string };
        expect(body.ok).toBe(false);
        expect(body.error).toMatch(/fetch/i);
        expect(updates).toHaveLength(0);
    });

    test("non-OpenAPI but reachable response: endpointCount is 0, still persisted", async () => {
        fetchImpl = async () => new Response('{"hello":"world"}', { status: 200 });
        const { cms, updates } = makeSystem();
        const res = await postDataProviderSync(makeRequest("hub"), cms);
        const body = await res.json() as { ok: boolean; endpointCount: number };
        expect(body).toEqual({ ok: true, endpointCount: 0 });
        expect(updates).toHaveLength(1);
    });

    test("bearer token is forwarded as Authorization header", async () => {
        const captured: { auth?: string | null } = {};
        fetchImpl = async (_url: string, init: RequestInit) => {
            captured.auth = (init.headers as Headers).get("Authorization");
            return new Response('{"openapi":"3.0.0","paths":{}}', { status: 200 });
        };
        const provider = { ...baseProvider, specAuth: { type: "bearer" as const, token: "abc123" } };
        const { cms } = makeSystem(provider);
        await postDataProviderSync(makeRequest("hub"), cms);
        expect(captured.auth).toBe("Bearer abc123");
    });

    test("custom headers are forwarded", async () => {
        const captured: Record<string, string> = {};
        fetchImpl = async (_url: string, init: RequestInit) => {
            (init.headers as Headers).forEach((v, k) => { captured[k] = v; });
            return new Response('{"openapi":"3.0.0","paths":{}}', { status: 200 });
        };
        const provider = {
            ...baseProvider,
            specAuth: { type: "headers" as const, headers: [{ name: "X-Api-Key", value: "secret" }] },
        };
        const { cms } = makeSystem(provider);
        await postDataProviderSync(makeRequest("hub"), cms);
        expect(captured["x-api-key"]).toBe("secret");
    });
});
