import { describe, expect, test } from "bun:test";
import {
    MAX_PROJECTED_JSON_BYTES,
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

describe("projectEndpointResponse failures", () => {
    test("uses one generic correlated envelope for status, media, JSON, and type errors", async () => {
        const cases: Array<[string, SourceEndpoint, Response]> = [
            ["status", endpoint({ output: [{ status: "201", body: { type: "object" } }] }), jsonResponse({}, 200)],
            ["media", endpoint(), new Response("private payload", { headers: { "content-type": "text/plain" } })],
            ["json", endpoint(), new Response("{private payload", { headers: { "content-type": "application/json" } })],
            ["type", endpoint({ output: [{ status: "200", body: { type: "array" } }] }), jsonResponse({ private: true })],
        ];

        for (const [name, source, upstream] of cases) {
            const response = await projectEndpointResponse(
                source,
                new Request("http://local.test/source"),
                upstream,
                {
                    reportResponseProjectionEvent: () => undefined,
                    ...(name === "status" ? { responseProjectionMode: "strict" as const } : {}),
                },
            );
            await expectGenericFailure(response, name);
        }
    });

    test("enforces the two MiB JSON byte limit at the boundary", async () => {
        const atLimit = JSON.stringify("a".repeat(MAX_PROJECTED_JSON_BYTES - 2));
        expect(new TextEncoder().encode(atLimit).byteLength).toBe(MAX_PROJECTED_JSON_BYTES);
        const accepted = await projectEndpointResponse(
            endpoint({ output: [{ status: "200", body: { type: "string" } }] }),
            new Request("http://local.test/source"),
            new Response(atLimit, { headers: { "content-type": "application/json" } }),
        );
        expect(accepted.status).toBe(200);
        expect((await accepted.text()).length).toBe(MAX_PROJECTED_JSON_BYTES);

        const overLimit = JSON.stringify("a".repeat(MAX_PROJECTED_JSON_BYTES - 1));
        expect(new TextEncoder().encode(overLimit).byteLength).toBe(MAX_PROJECTED_JSON_BYTES + 1);
        const rejected = await projectEndpointResponse(
            endpoint({ output: [{ status: "200", body: { type: "string" } }] }),
            new Request("http://local.test/source"),
            new Response(overLimit, { headers: { "content-type": "application/json" } }),
            { reportResponseProjectionEvent: () => undefined },
        );
        await expectGenericFailure(rejected, "size");
    });
});

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json" },
    });
}

async function expectGenericFailure(response: Response, name: string): Promise<void> {
    expect(response.status, name).toBe(502);
    expect(response.headers.get("cache-control"), name).toBe("no-store");
    expect(response.headers.get("content-type"), name).toBe("application/json; charset=utf-8");
    expect(response.headers.get("x-content-type-options"), name).toBe("nosniff");
    const correlationId = response.headers.get("x-correlation-id");
    expect(correlationId, name).toMatch(/^[0-9a-f-]{36}$/);
    expect(await response.json(), name).toEqual({
        error: "Upstream request failed",
        correlationId,
    });
}
