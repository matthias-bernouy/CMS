import { describe, expect, mock, test } from "bun:test";
import { executeEndpoint } from "cms-sources/core/executeEndpoint";
import {
    MAX_PROJECTED_JSON_BYTES,
    projectEndpointResponse,
} from "cms-sources/core/response-projection/projectEndpointResponse";
import type { SourceEndpoint } from "cms-sources/interfaces/Source";

describe("executeEndpoint strict JSON responses", () => {
    test("projects structured responses and preserves intentionally opaque objects", async () => {
        const response = await executeEndpoint(structuredEndpoint(), new Request("http://local/x"), {
            fetchImpl: mock(async () => Response.json({
                id: "item-1",
                internalSecret: "secret",
                owner: { name: "Ada", email: "private@example.com" },
                items: [{ id: "child-1", costPrice: 12 }],
                providerData: { arbitrary: true },
            }, {
                headers: {
                    "cache-control": "private, no-store",
                    etag: '"upstream-etag"',
                },
            })),
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
        const response = await executeEndpoint({
            ...structuredEndpoint(),
            output: [
                { status: "201", body: { type: "object", properties: { id: { type: "string" } } } },
                { status: "default", body: { type: "object", properties: { error: { type: "string" } } } },
            ],
        }, new Request("http://local/x"), {
            fetchImpl: mock(async () => Response.json({ id: "created", error: "private", secret: "private" }, { status: 201 })),
        });

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ id: "created" });
    });

    test("projects a declared default response", async () => {
        const response = await executeEndpoint({
            ...structuredEndpoint(),
            output: [{
                status: "default",
                body: { type: "object", properties: { error: { type: "string" } } },
            }],
        }, new Request("http://local/x"), {
            fetchImpl: mock(async () => Response.json({ error: "safe", providerTrace: "private" }, { status: 418 })),
        });

        expect(response.status).toBe(418);
        expect(await response.json()).toEqual({ error: "safe" });
    });

    test("replaces undeclared upstream statuses with a generic correlated error", async () => {
        const failures: unknown[] = [];
        const response = await executeEndpoint(structuredEndpoint(), new Request("http://local/x"), {
            fetchImpl: mock(async () => Response.json({
                error: "provider error",
                stack: "secret provider stack",
                apiKey: "provider-secret",
            }, { status: 500 })),
            reportFailure: failure => failures.push(failure),
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
        expect(failures).toEqual([{
            correlationId,
            endpointUrn: "urn:items:getItem",
            kind: "undeclared_upstream_status",
            upstreamStatus: 500,
        }]);
        expect(JSON.stringify(failures)).not.toContain("provider-secret");
    });

    test("replaces undeclared file errors instead of streaming their body", async () => {
        let cancelled = false;
        const response = await executeEndpoint({
            urn: "urn:files:download",
            method: "GET",
            targetUrl: "https://files.example.com/item",
            responseKind: "file",
            output: [{ status: "200" }],
        }, new Request("http://local/x"), {
            fetchImpl: mock(async () => new Response(new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode("provider stack and secret"));
                },
                cancel() {
                    cancelled = true;
                },
            }), { status: 500, headers: { "content-type": "text/plain" } })),
            reportFailure: () => undefined,
        });

        expect(response.status).toBe(502);
        expect(cancelled).toBe(true);
        expect(await response.text()).not.toContain("provider stack");
    });

    test("rejects an undeclared successful file status", async () => {
        const response = await executeEndpoint({
            urn: "urn:files:download",
            method: "GET",
            targetUrl: "https://files.example.com/item",
            responseKind: "file",
            output: [{ status: "200" }],
        }, new Request("http://local/x"), {
            fetchImpl: mock(async () => new Response("partial file", { status: 206 })),
            reportFailure: () => undefined,
        });

        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain("partial file");
    });

    test.each([
        ["throwing", () => { throw new Error("logger unavailable"); }],
        ["rejecting", async () => { throw new Error("logger unavailable"); }],
    ])("keeps the safe envelope when the %s failure reporter fails", async (_name, reportFailure) => {
        const response = await executeEndpoint(structuredEndpoint(), new Request("http://local/x"), {
            fetchImpl: mock(async () => Response.json({ apiKey: "provider-secret" }, { status: 500 })),
            reportFailure,
        });

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({
            error: "Upstream request failed",
            correlationId: response.headers.get("x-correlation-id"),
        });
    });

    test("discards an upstream body when the status contract declares no body", async () => {
        const response = await executeEndpoint({
            ...structuredEndpoint(),
            output: [{ status: "200" }],
        }, new Request("http://local/x"), {
            fetchImpl: mock(async () => Response.json({ internalSecret: "secret" })),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBeNull();
        expect(await response.text()).toBe("");
    });

    test("bounds projected JSON response bodies", async () => {
        const response = await projectEndpointResponse(
            {
                ...structuredEndpoint(),
                output: [{ status: "200", body: { type: "object" } }],
            },
            new Request("http://local/x"),
            Response.json({ value: "x".repeat(MAX_PROJECTED_JSON_BYTES) }),
        );

        await expectGenericUpstreamFailure(response);
    });

    test("keeps declared file responses streaming", async () => {
        const response = await executeEndpoint({
            urn: "urn:files:download",
            method: "GET",
            targetUrl: "https://files.example.com/item",
            responseKind: "file",
            output: [{ status: "200" }],
        }, new Request("http://local/x"), {
            fetchImpl: mock(async () => new Response("file-body", {
                headers: { "content-type": "application/octet-stream" },
            })),
        });

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("file-body");
    });
});

function structuredEndpoint(): SourceEndpoint {
    return {
        urn: "urn:items:getItem",
        method: "GET",
        targetUrl: "https://api.example.com/items/1",
        output: [{
            status: "200",
            body: {
                type: "object",
                properties: {
                    id: { type: "string" },
                    owner: {
                        type: "object",
                        properties: { name: { type: "string" } },
                    },
                    items: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: { id: { type: "string" } },
                        },
                    },
                    providerData: { type: "object" },
                },
                required: ["id"],
            },
        }],
    };
}

async function expectGenericUpstreamFailure(response: Response): Promise<void> {
    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const correlationId = response.headers.get("x-correlation-id");
    expect(correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(await response.json()).toEqual({ error: "Upstream request failed", correlationId });
}
