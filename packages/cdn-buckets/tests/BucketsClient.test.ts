import { describe, test, expect } from "bun:test";
import { BucketsClient, BucketsClientError } from "src/exports/BucketsClient";

type FetchCall = { url: string; method: string; headers: Record<string, string>; body?: unknown };

function makeFakeFetch(response: { ok: boolean; status?: number; data?: unknown; error?: { code: string; message: string } }): { fetch: typeof fetch; calls: FetchCall[] } {
    const calls: FetchCall[] = [];
    const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        const headers: Record<string, string> = {};
        if (init?.headers) {
            for (const [k, v] of Object.entries(init.headers as Record<string, string>)) headers[k] = v;
        }
        let body: unknown = undefined;
        if (init?.body) {
            const raw = init.body;
            body = typeof raw === "string" ? JSON.parse(raw) : raw;
        }
        calls.push({ url, method, headers, body });
        return new Response(JSON.stringify(response), { status: response.status ?? (response.ok ? 200 : 400) });
    }) as unknown as typeof fetch;
    return { fetch: fakeFetch, calls };
}

const ORIGIN = "https://cdn-origin.bernouy.com";

describe("BucketsClient — request shape", () => {
    test("attaches Bearer token + JSON content-type", async () => {
        const { fetch, calls } = makeFakeFetch({ ok: true, data: [] });
        const client = new BucketsClient({ baseUrl: ORIGIN, token: "bspa_xxx", fetch });
        await client.listBuckets();
        expect(calls).toHaveLength(1);
        expect(calls[0]!.headers["Authorization"]).toBe("Bearer bspa_xxx");
        expect(calls[0]!.method).toBe("GET");
        expect(calls[0]!.url).toBe(`${ORIGIN}/admin/api/buckets/list`);
    });

    test("strips trailing slash from baseUrl", async () => {
        const { fetch, calls } = makeFakeFetch({ ok: true, data: [] });
        const client = new BucketsClient({ baseUrl: `${ORIGIN}//`, token: "t", fetch });
        await client.listBuckets();
        expect(calls[0]!.url).toBe(`${ORIGIN}/admin/api/buckets/list`);
    });

    test("createBucket flattens nested quotas/limits/origins", async () => {
        const { fetch, calls } = makeFakeFetch({ ok: true, data: { id: "b" } });
        const client = new BucketsClient({ baseUrl: ORIGIN, token: "t", fetch });
        await client.createBucket({
            id:           "b",
            cacheControl: "public, max-age=86400",
            quotas:       { maxTotalSize: 1000, maxFileCount: 10 },
            limits:       { maxFileSize: 100, acceptedMimeTypes: "*" },
            allowedUploadOrigins: ["https://app.example"],
        });
        expect(calls[0]!.method).toBe("POST");
        expect(calls[0]!.body).toEqual({
            id: "b", cacheControl: "public, max-age=86400",
            maxTotalSize: 1000, maxFileCount: 10,
            maxFileSize: 100, acceptedMimeTypes: "*",
            allowedUploadOrigins: "https://app.example",
        });
    });

    test("createBucketCredential serializes Date as ISO", async () => {
        const { fetch, calls } = makeFakeFetch({ ok: true, data: { credential: { id: "x" }, cleartextToken: "bsp_y" } });
        const client = new BucketsClient({ baseUrl: ORIGIN, token: "t", fetch });
        const expiresAt = new Date("2027-01-01T00:00:00Z");
        await client.createBucketCredential("b", { label: "ci", expiresAt });
        expect(calls[0]!.url).toBe(`${ORIGIN}/admin/api/credentials?bucketId=b`);
        expect(calls[0]!.body).toEqual({ label: "ci", expiresAt: "2027-01-01T00:00:00.000Z" });
    });

    test("URL params are encoded (special chars in bucketId)", async () => {
        const { fetch, calls } = makeFakeFetch({ ok: true, data: { id: "x" } });
        const client = new BucketsClient({ baseUrl: ORIGIN, token: "t", fetch });
        await client.deleteBucket("a b/c");
        expect(calls[0]!.url).toBe(`${ORIGIN}/admin/api/buckets?bucketId=a%20b%2Fc`);
        expect(calls[0]!.method).toBe("DELETE");
    });
});

describe("BucketsClient — response handling", () => {
    test("unwraps `data` from envelope on success", async () => {
        const { fetch } = makeFakeFetch({ ok: true, data: [{ id: "b1" }, { id: "b2" }] });
        const client = new BucketsClient({ baseUrl: ORIGIN, token: "t", fetch });
        const result = await client.listBuckets();
        expect(result).toEqual([{ id: "b1" }, { id: "b2" }] as unknown as Awaited<ReturnType<typeof client.listBuckets>>);
    });

    test("throws BucketsClientError on `ok: false` envelope, preserves code + message + status", async () => {
        const { fetch } = makeFakeFetch({ ok: false, status: 404, error: { code: "not_found", message: "Bucket \"x\" not found" } });
        const client = new BucketsClient({ baseUrl: ORIGIN, token: "t", fetch });
        try {
            await client.getBucket("x");
            expect.unreachable();
        } catch (err) {
            expect(err).toBeInstanceOf(BucketsClientError);
            expect((err as BucketsClientError).code).toBe("not_found");
            expect((err as BucketsClientError).httpStatus).toBe(404);
            expect((err as Error).message).toBe('Bucket "x" not found');
        }
    });

    test("throws on non-JSON response body", async () => {
        const fakeFetch = (async () => new Response("<html>500</html>", { status: 502 })) as unknown as typeof fetch;
        const client = new BucketsClient({ baseUrl: ORIGIN, token: "t", fetch: fakeFetch });
        await expect(client.listBuckets()).rejects.toBeInstanceOf(BucketsClientError);
    });
});

describe("BucketsClient — proxies", () => {
    test("upsertProxy posts rules + secrets verbatim", async () => {
        const { fetch, calls } = makeFakeFetch({ ok: true, data: { bucketId: "b", providerId: "stripe" } });
        const client = new BucketsClient({ baseUrl: ORIGIN, token: "t", fetch });
        const rules = {
            defaults: { on_request: [
                { type: "inject_header" as const, name: "Authorization", value: "Bearer ${env:STRIPE_KEY}" },
            ] },
            paths: { "/v1/charges": { on_request: [] } },
        };
        await client.upsertProxy("b", {
            providerId: "stripe",
            server:     "https://api.stripe.com/v1",
            rules,
            secrets:    { STRIPE_KEY: "sk_live_abc" },
        });
        expect(calls[0]!.method).toBe("POST");
        expect(calls[0]!.url).toBe(`${ORIGIN}/admin/api/proxies?bucketId=b`);
        expect(calls[0]!.body).toEqual({
            providerId: "stripe",
            server:     "https://api.stripe.com/v1",
            rules,
            secrets:    { STRIPE_KEY: "sk_live_abc" },
        });
    });

    test("deleteProxy URL-encodes both query params", async () => {
        const { fetch, calls } = makeFakeFetch({ ok: true, data: { bucketId: "b", providerId: "p" } });
        const client = new BucketsClient({ baseUrl: ORIGIN, token: "t", fetch });
        await client.deleteProxy("b/c", "stripe-eu");
        expect(calls[0]!.method).toBe("DELETE");
        expect(calls[0]!.url).toBe(`${ORIGIN}/admin/api/proxies?bucketId=b%2Fc&providerId=stripe-eu`);
    });

    test("listProxies bucket id encoded in query", async () => {
        const { fetch, calls } = makeFakeFetch({ ok: true, data: [] });
        const client = new BucketsClient({ baseUrl: ORIGIN, token: "t", fetch });
        await client.listProxies("acme bucket");
        expect(calls[0]!.method).toBe("GET");
        expect(calls[0]!.url).toBe(`${ORIGIN}/admin/api/proxies/list?bucketId=acme%20bucket`);
    });
});
