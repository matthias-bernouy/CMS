import { describe, expect, mock, test } from "bun:test";
import { executeEndpoint } from "cms-sources/core/execution/executeEndpoint";
import {
    MAX_PROJECTED_JSON_BYTES,
    projectEndpointResponse,
} from "cms-sources/core/response-projection/projectEndpointResponse";
import { expectGenericUpstreamFailure, structuredEndpoint } from "../../helpers/strictResponseFixtures";

describe("executeEndpoint strict file and bodyless responses", () => {
    test("replaces undeclared file errors instead of streaming their body", async () => {
        let cancelled = false;
        const response = await executeEndpoint(fileEndpoint(), new Request("http://local/x"), {
            fetchImpl: mock(
                async () =>
                    new Response(
                        new ReadableStream({
                            start(controller) {
                                controller.enqueue(new TextEncoder().encode("provider stack and secret"));
                            },
                            cancel() {
                                cancelled = true;
                            },
                        }),
                        { status: 500, headers: { "content-type": "text/plain" } },
                    ),
            ),
            reportFailure: () => undefined,
            reportResponseProjectionEvent: () => undefined,
        });
        expect(response.status).toBe(502);
        expect(cancelled).toBe(true);
        expect(await response.text()).not.toContain("provider stack");
    });

    test("rejects an undeclared successful file status", async () => {
        const response = await executeEndpoint(fileEndpoint(), new Request("http://local/x"), {
            fetchImpl: mock(async () => new Response("partial file", { status: 206 })),
            reportFailure: () => undefined,
            reportResponseProjectionEvent: () => undefined,
        });
        expect(response.status).toBe(502);
        expect(await response.text()).not.toContain("partial file");
    });

    test.each([
        [
            "throwing",
            () => {
                throw new Error("logger unavailable");
            },
        ],
        [
            "rejecting",
            async () => {
                throw new Error("logger unavailable");
            },
        ],
    ])("keeps the safe envelope when the %s failure reporter fails", async (_name, reportFailure) => {
        const response = await executeEndpoint(structuredEndpoint(), new Request("http://local/x"), {
            fetchImpl: mock(async () => Response.json({ apiKey: "provider-secret" }, { status: 500 })),
            reportFailure,
            reportResponseProjectionEvent: () => undefined,
        });
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({
            error: "Upstream request failed",
            correlationId: response.headers.get("x-correlation-id"),
        });
    });

    test("discards an upstream body when the status contract declares no body", async () => {
        const response = await executeEndpoint(
            { ...structuredEndpoint(), output: [{ status: "200" }] },
            new Request("http://local/x"),
            { fetchImpl: mock(async () => Response.json({ internalSecret: "secret" })) },
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBeNull();
        expect(await response.text()).toBe("");
    });

    test("bounds projected JSON response bodies", async () => {
        const response = await projectEndpointResponse(
            { ...structuredEndpoint(), output: [{ status: "200", body: { type: "object" } }] },
            new Request("http://local/x"),
            Response.json({ value: "x".repeat(MAX_PROJECTED_JSON_BYTES) }),
            { reportResponseProjectionEvent: () => undefined },
        );
        await expectGenericUpstreamFailure(response);
    });

    test("keeps declared file responses streaming", async () => {
        const response = await executeEndpoint(fileEndpoint(), new Request("http://local/x"), {
            fetchImpl: mock(
                async () => new Response("file-body", { headers: { "content-type": "application/octet-stream" } }),
            ),
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("file-body");
    });
});

function fileEndpoint() {
    return {
        urn: "urn:files:download",
        method: "GET" as const,
        targetUrl: "https://files.example.com/item",
        responseKind: "file" as const,
        output: [{ status: "200" }],
    };
}
