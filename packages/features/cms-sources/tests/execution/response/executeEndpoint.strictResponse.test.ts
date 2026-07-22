import { describe, expect, mock, test } from "bun:test";
import { executeEndpoint } from "cms-sources/core/execution/executeEndpoint";
import { expectGenericUpstreamFailure, structuredEndpoint } from "../../helpers/strictResponseFixtures";

describe("executeEndpoint strict JSON responses", () => {
    test("projects structured responses and preserves intentionally opaque objects", async () => {
        const response = await executeEndpoint(structuredEndpoint(), new Request("http://local/x"), {
            fetchImpl: mock(async () =>
                Response.json(
                    {
                        id: "item-1",
                        internalSecret: "secret",
                        owner: { name: "Ada", email: "private@example.com" },
                        items: [{ id: "child-1", costPrice: 12 }],
                        providerData: { arbitrary: true },
                    },
                    {
                        headers: {
                            "cache-control": "private, no-store",
                            etag: '"upstream-etag"',
                        },
                    },
                ),
            ),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("etag")).toBeNull();
        expect(await response.json()).toEqual({
            id: "item-1",
            owner: { name: "Ada" },
            items: [{ id: "child-1" }],
            providerData: { arbitrary: true },
        });
    });

    test.each([
        ["invalid JSON", new Response("not-json", { headers: { "content-type": "application/json" } })],
        ["wrong media type", new Response('{"id":"item-1"}', { headers: { "content-type": "text/html" } })],
        ["wrong declared type", Response.json({ id: 42 })],
        ["null required property", Response.json({ id: null })],
    ])("maps %s to a generic upstream failure", async (_name, upstream) => {
        const response = await executeEndpoint(structuredEndpoint(), new Request("http://local/x"), {
            fetchImpl: mock(async () => upstream),
            reportResponseProjectionEvent: () => undefined,
        });

        await expectGenericUpstreamFailure(response);
    });

    test("allows conditionally absent fields while projecting the fields that are present", async () => {
        const response = await executeEndpoint(structuredEndpoint(), new Request("http://local/x"), {
            fetchImpl: mock(async () => Response.json({ owner: { name: "Ada", email: "private@example.com" } })),
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ owner: { name: "Ada" } });
    });

    test("uses an exact status contract before the default contract", async () => {
        const response = await executeEndpoint(
            {
                ...structuredEndpoint(),
                output: [
                    { status: "201", body: { type: "object", properties: { id: { type: "string" } } } },
                    { status: "default", body: { type: "object", properties: { error: { type: "string" } } } },
                ],
            },
            new Request("http://local/x"),
            {
                fetchImpl: mock(async () =>
                    Response.json({ id: "created", error: "private", secret: "private" }, { status: 201 }),
                ),
            },
        );

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ id: "created" });
    });

    test("projects a declared default response", async () => {
        const response = await executeEndpoint(
            {
                ...structuredEndpoint(),
                output: [
                    {
                        status: "default",
                        body: { type: "object", properties: { error: { type: "string" } } },
                    },
                ],
            },
            new Request("http://local/x"),
            {
                fetchImpl: mock(async () =>
                    Response.json({ error: "safe", providerTrace: "private" }, { status: 418 }),
                ),
            },
        );

        expect(response.status).toBe(418);
        expect(await response.json()).toEqual({ error: "safe" });
    });

    test("replaces undeclared upstream statuses with a generic correlated error", async () => {
        const failures: unknown[] = [];
        const response = await executeEndpoint(structuredEndpoint(), new Request("http://local/x"), {
            fetchImpl: mock(async () =>
                Response.json(
                    {
                        error: "provider error",
                        stack: "secret provider stack",
                        apiKey: "provider-secret",
                    },
                    { status: 500 },
                ),
            ),
            reportFailure: (failure) => failures.push(failure),
            reportResponseProjectionEvent: () => undefined,
        });

        expect(response.status).toBe(502);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        const correlationId = response.headers.get("x-correlation-id");
        expect(correlationId).toMatch(/^[0-9a-f-]{36}$/);
        expect(await response.json()).toEqual({
            error: "Upstream request failed",
            correlationId,
        });
        expect(failures).toEqual([
            {
                correlationId,
                endpointUrn: "urn:items:getItem",
                kind: "undeclared_upstream_status",
                upstreamStatus: 500,
            },
        ]);
        expect(JSON.stringify(failures)).not.toContain("provider-secret");
    });
});
