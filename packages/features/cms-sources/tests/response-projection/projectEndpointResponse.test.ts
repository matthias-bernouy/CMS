import { describe, expect, test } from "bun:test";
import {
    projectEndpointResponse,
} from "cms-sources/core/response-projection/projectEndpointResponse";
import type { SourceEndpoint } from "cms-sources/interfaces/Source";

const endpoint = (over: Partial<SourceEndpoint> = {}): SourceEndpoint => ({
    urn: "urn:test:response",
    method: "GET",
    targetUrl: "https://api.example.test/data",
    output: [{ status: "200", body: { type: "object" } }],
    ...over,
});

describe("projectEndpointResponse", () => {
    test("selects an exact status before default and projects nested properties", async () => {
        const source = endpoint({
            output: [
                {
                    status: "default",
                    body: { type: "object", properties: { fallback: { type: "string" } } },
                },
                {
                    status: "201",
                    body: {
                        type: "object",
                        properties: {
                            exact: { type: "string" },
                            nested: {
                                type: "object",
                                properties: { visible: { type: "boolean" } },
                            },
                        },
                    },
                },
            ],
        });
        const response = await projectEndpointResponse(
            source,
            new Request("http://local.test/source"),
            jsonResponse({ exact: "yes", fallback: "no", nested: { visible: true, secret: "drop" } }, 201),
        );

        expect(response.status).toBe(201);
        expect(await response.json()).toEqual({ exact: "yes", nested: { visible: true } });
    });

    test("uses default when no exact status is declared", async () => {
        const response = await projectEndpointResponse(
            endpoint({
                output: [{
                    status: "default",
                    body: { type: "object", properties: { fallback: { type: "string" } } },
                }],
            }),
            new Request("http://local.test/source"),
            jsonResponse({ fallback: "yes", extra: "drop" }, 202),
        );

        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ fallback: "yes" });
    });

    test("rewrites transformed JSON headers and preserves safe cache policy", async () => {
        const response = await projectEndpointResponse(
            endpoint({
                output: [{
                    status: "200",
                    body: { type: "object", properties: { id: { type: "string" } } },
                }],
            }),
            new Request("http://local.test/source"),
            new Response(JSON.stringify({ id: "1", secret: "drop" }), {
                headers: {
                    "cache-control": "public, max-age=60",
                    "content-encoding": "gzip",
                    "content-length": "999",
                    "content-type": "application/problem+json; charset=utf-8",
                    etag: "upstream-etag",
                    "last-modified": "Tue, 01 Jan 2030 00:00:00 GMT",
                },
            }),
        );

        expect(response.headers.get("cache-control")).toBe("public, max-age=60");
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("etag")).toBeNull();
        expect(response.headers.get("last-modified")).toBeNull();
        expect(response.headers.get("content-encoding")).toBeNull();
        expect(response.headers.get("content-length")).toBeNull();
        expect(await response.json()).toEqual({ id: "1" });
    });

    test("streams declared files with filtered headers without enforcing media type", async () => {
        const upstream = new Response("file bytes", {
            headers: {
                "content-type": "text/plain",
                "set-cookie": "private=1",
            },
        });
        const response = await projectEndpointResponse(
            endpoint({
                responseKind: "file",
                mediaType: "application/pdf",
                output: [{ status: "200" }],
            }),
            new Request("http://local.test/source"),
            upstream,
        );

        expect(response.body).not.toBeNull();
        expect(response.headers.get("content-type")).toBe("text/plain");
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(await response.text()).toBe("file bytes");
    });

    test("discards JSON no-body contracts and every HEAD body", async () => {
        let noBodyCancelled = false;
        const noBodyUpstream = cancellableResponse(() => { noBodyCancelled = true; }, 202, {
            "content-type": "application/json",
            etag: "stale-body-etag",
            "last-modified": "Tue, 01 Jan 2030 00:00:00 GMT",
        });
        const noBody = await projectEndpointResponse(
            endpoint({ output: [{ status: "202" }] }),
            new Request("http://local.test/source"),
            noBodyUpstream,
        );
        expect(noBody.status).toBe(202);
        expect(noBody.body).toBeNull();
        expect(noBodyCancelled).toBe(true);
        expect(noBody.headers.get("content-type")).toBeNull();
        expect(noBody.headers.get("etag")).toBeNull();
        expect(noBody.headers.get("last-modified")).toBeNull();

        let headCancelled = false;
        const head = await projectEndpointResponse(
            endpoint({ responseKind: "file", output: [{ status: "200" }] }),
            new Request("http://local.test/source", { method: "HEAD" }),
            cancellableResponse(() => { headCancelled = true; }),
        );
        expect(head.body).toBeNull();
        expect(headCancelled).toBe(true);
    });
});

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json" },
    });
}

function cancellableResponse(cancel: () => void, status = 200, headers?: HeadersInit): Response {
    return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(new TextEncoder().encode("upstream body"));
        },
        cancel,
    }), { status, headers });
}
