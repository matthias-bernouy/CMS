import { describe, expect, mock, test } from "bun:test";
import { executeEndpoint } from "cms-sources/core/execution/executeEndpoint";
import type { ResponseProjectionEvent } from "cms-sources/core/response-projection/projectEndpointResponse";
import { ep } from "../../helpers/executeEndpointFixtures";

describe("executeEndpoint strict response projection", () => {
    test("reports a media mismatch, cancels upstream, and correlates the generic error", async () => {
        let cancelled = false;
        let event: ResponseProjectionEvent | undefined;
        const fetchImpl = mock(
            async () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        start(controller) {
                            controller.enqueue(new TextEncoder().encode("sensitive upstream payload"));
                        },
                        cancel() {
                            cancelled = true;
                        },
                    }),
                    { headers: { "content-type": "text/plain" } },
                ),
        );
        const reportResponseProjectionEvent = mock((reported: ResponseProjectionEvent) => {
            event = reported;
        });
        const response = await executeEndpoint(ep(), new Request("http://local.test/source"), {
            fetchImpl,
            responseProjectionMode: "strict",
            reportResponseProjectionEvent,
        });

        expect(cancelled).toBe(true);
        expect(reportResponseProjectionEvent).toHaveBeenCalledTimes(1);
        expect(response.status).toBe(502);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        const correlationId = response.headers.get("x-correlation-id");
        expect(await response.json()).toEqual({ error: "Upstream request failed", correlationId });
        expect(event).toEqual({
            kind: "response_projection_failure",
            endpointUrn: "urn:x:e",
            upstreamStatus: 200,
            reason: "unsupported_media_type",
            correlationId,
            path: "$",
            expectedType: "object",
        });
    });

    test("projects declared JSON through the executor", async () => {
        const response = await executeEndpoint(
            ep({
                output: [
                    {
                        status: "200",
                        body: {
                            type: "object",
                            properties: { publicName: { type: "string" } },
                        },
                    },
                ],
            }),
            new Request("http://local.test/source"),
            {
                fetchImpl: mock(async () =>
                    Response.json({
                        publicName: "Ada",
                        accessToken: "must-not-leak",
                    }),
                ),
            },
        );

        expect(await response.json()).toEqual({ publicName: "Ada" });
    });

    test("keeps the timeout boundary around a declared response body", async () => {
        const fetchImpl = mock(
            async () =>
                new Response(
                    new ReadableStream<Uint8Array>({
                        pull(controller) {
                            const error = new Error("response body timed out");
                            error.name = "AbortError";
                            controller.error(error);
                        },
                    }),
                    { headers: { "content-type": "application/json" } },
                ),
        );

        const response = await executeEndpoint(
            ep({ output: [{ status: "200", body: { type: "object" } }] }),
            new Request("http://local.test/source"),
            { fetchImpl },
        );

        expect(response.status).toBe(504);
        expect(await response.text()).toBe("Source Timeout");
    });
});
