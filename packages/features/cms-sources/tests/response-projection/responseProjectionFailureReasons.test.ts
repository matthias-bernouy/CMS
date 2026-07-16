import { describe, expect, spyOn, test } from "bun:test";
import {
    MAX_PROJECTED_JSON_BYTES,
    projectEndpointResponse,
    type ResponseProjectionEvent,
    type ResponseProjectionFailureReason,
    type ResponseProjectionMode,
} from "cms-sources/core/response-projection/projectEndpointResponse";
import type { SourceEndpoint } from "cms-sources/interfaces/Source";

type FailureCase = {
    reason: ResponseProjectionFailureReason;
    endpoint: () => SourceEndpoint;
    upstream: () => Response;
    mode?: ResponseProjectionMode;
    hasTypeMetadata?: boolean;
};

const cases: FailureCase[] = [
    {
        reason: "missing_output",
        endpoint: () => endpoint({ output: undefined }),
        upstream: () => Response.json({ private: true }),
        mode: "strict",
    },
    {
        reason: "empty_output",
        endpoint: () => endpoint({ output: [] }),
        upstream: () => Response.json({ private: true }),
        mode: "strict",
    },
    {
        reason: "unmatched_status",
        endpoint: () => endpoint({ output: [{ status: "201", body: { type: "object" } }] }),
        upstream: () => Response.json({ private: true }),
        mode: "strict",
    },
    {
        reason: "unsupported_media_type",
        endpoint,
        upstream: () => new Response("private", { headers: { "content-type": "text/plain" } }),
        hasTypeMetadata: true,
    },
    {
        reason: "missing_body",
        endpoint,
        upstream: () => new Response(null, { headers: { "content-type": "application/json" } }),
        hasTypeMetadata: true,
    },
    {
        reason: "invalid_utf8",
        endpoint,
        upstream: () => new Response(new Uint8Array([0xc3, 0x28]), {
            headers: { "content-type": "application/json" },
        }),
        hasTypeMetadata: true,
    },
    {
        reason: "invalid_json",
        endpoint,
        upstream: () => new Response("{private", { headers: { "content-type": "application/json" } }),
        hasTypeMetadata: true,
    },
    {
        reason: "body_read_error",
        endpoint,
        upstream: () => new Response(new ReadableStream({
            pull(controller) {
                controller.error(new Error("private stream failure"));
            },
        }), { headers: { "content-type": "application/json" } }),
        hasTypeMetadata: true,
    },
    {
        reason: "body_too_large",
        endpoint: () => endpoint({ output: [{ status: "200", body: { type: "string" } }] }),
        upstream: () => new Response(JSON.stringify("x".repeat(MAX_PROJECTED_JSON_BYTES)), {
            headers: { "content-type": "application/json" },
        }),
        hasTypeMetadata: true,
    },
];

describe("response projection failure reasons", () => {
    for (const failure of cases) {
        test(`reports ${failure.reason} without upstream content`, async () => {
            const events: ResponseProjectionEvent[] = [];
            const response = await projectEndpointResponse(
                failure.endpoint(),
                new Request("http://local.test/source?private=person@example.test"),
                failure.upstream(),
                {
                    responseProjectionMode: failure.mode,
                    reportResponseProjectionEvent: event => events.push(event),
                },
            );
            const correlationId = response.headers.get("x-correlation-id");

            expect(response.status).toBe(502);
            expect(await response.json()).toEqual({ error: "Upstream request failed", correlationId });
            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({
                kind: "response_projection_failure",
                endpointUrn: "urn:test:diagnostic",
                upstreamStatus: 200,
                reason: failure.reason,
                correlationId,
                ...(failure.hasTypeMetadata ? { path: "$" } : {}),
            });
            expect(JSON.stringify(events)).not.toContain("private");
            expect(JSON.stringify(events)).not.toContain("person@example.test");
        });
    }

    test("keeps the generic response when the default logger throws", async () => {
        const error = spyOn(console, "error").mockImplementation(() => {
            throw new Error("logger unavailable");
        });
        try {
            const response = await projectEndpointResponse(
                endpoint(),
                new Request("http://local.test/source"),
                Response.json("wrong type"),
            );
            expect(response.status).toBe(502);
            expect(await response.json()).toEqual({
                error: "Upstream request failed",
                correlationId: response.headers.get("x-correlation-id"),
            });
        } finally {
            error.mockRestore();
        }
    });
});

function endpoint(overrides: Partial<SourceEndpoint> = {}): SourceEndpoint {
    return {
        urn: "urn:test:diagnostic",
        method: "GET",
        targetUrl: "https://api.example.test/private",
        output: [{ status: "200", body: { type: "object" } }],
        ...overrides,
    };
}
