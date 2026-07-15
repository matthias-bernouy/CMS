import { describe, expect, mock, test } from "bun:test";
import {
    executeEndpoint,
} from "cms-sources/core/executeEndpoint";
import type { ResponseProjectionEvent } from "cms-sources/core/response-projection/projectEndpointResponse";
import { ep } from "../helpers/executeEndpointFixtures";

describe("executeEndpoint response projection integration", () => {
    test("defaults legacy endpoints to exact streaming compatibility and reports a sanitized event", async () => {
        const upstream = new Response("legacy body", {
            status: 201,
            headers: {
                "content-type": "text/plain",
                "set-cookie": "private=1",
            },
        });
        let event: ResponseProjectionEvent | undefined;
        const reportResponseProjectionEvent = mock((reported: ResponseProjectionEvent) => {
            event = reported;
            throw new Error("observer failure must be neutral");
        });
        const response = await executeEndpoint(ep({
            targetUrl: "https://api.example.com/private?token=secret",
            headers: [{ name: "Authorization", source: { from: "static", value: "Bearer secret" } }],
        }), new Request("http://local.test/source?private=value", {
            headers: { cookie: "session=secret" },
        }), {
            fetchImpl: mock(async () => upstream),
            reportResponseProjectionEvent,
        });

        expect(response.status).toBe(201);
        expect(response.body).not.toBeNull();
        expect(response.headers.get("content-type")).toBe("text/plain");
        expect(response.headers.get("set-cookie")).toBeNull();
        expect(await response.text()).toBe("legacy body");
        expect(reportResponseProjectionEvent).toHaveBeenCalledTimes(1);
        expect(event).toEqual({
            kind: "legacy_response_contract",
            endpointUrn: "urn:x:e",
            upstreamStatus: 201,
            reason: "missing_output",
            correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
        });
        expect(Object.keys(event!).sort()).toEqual([
            "correlationId",
            "endpointUrn",
            "kind",
            "reason",
            "upstreamStatus",
        ]);
        expect(JSON.stringify(event)).not.toContain("secret");
        expect(JSON.stringify(event)).not.toContain("private");
    });

    test("distinguishes empty legacy output and ignores an async reporter rejection", async () => {
        let event: ResponseProjectionEvent | undefined;
        const response = await executeEndpoint(ep({ output: [] }), new Request("http://local.test/source"), {
            fetchImpl: mock(async () => new Response("legacy")),
            reportResponseProjectionEvent: async (reported) => {
                event = reported;
                throw new Error("observer rejected");
            },
        });
        await Promise.resolve();

        expect(response.status).toBe(200);
        expect(await response.text()).toBe("legacy");
        expect(event?.reason).toBe("empty_output");
    });

    test("preserves an unmatched status in compatibility mode and reports it", async () => {
        let event: ResponseProjectionEvent | undefined;
        const response = await executeEndpoint(ep({
            output: [{ status: "200", body: { type: "object" } }],
        }), new Request("http://local.test/source"), {
            fetchImpl: mock(async () => new Response(JSON.stringify({ error: "invalid input" }), {
                status: 400,
                headers: { "content-type": "application/json" },
            })),
            reportResponseProjectionEvent: (reported) => { event = reported; },
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "invalid input" });
        expect(event).toMatchObject({
            kind: "legacy_response_contract",
            endpointUrn: "urn:x:e",
            upstreamStatus: 400,
            reason: "unmatched_status",
        });
    });

    test("strict mode rejects a missing contract, cancels upstream, and correlates the generic error", async () => {
        let cancelled = false;
        const fetchImpl = mock(async () => new Response(new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new TextEncoder().encode("sensitive upstream payload"));
            },
            cancel() {
                cancelled = true;
            },
        }), { headers: { "content-type": "text/plain" } }));
        const reportResponseProjectionEvent = mock(() => undefined);
        const response = await executeEndpoint(ep(), new Request("http://local.test/source"), {
            fetchImpl,
            responseProjectionMode: "strict",
            reportResponseProjectionEvent,
        });

        expect(cancelled).toBe(true);
        expect(reportResponseProjectionEvent).not.toHaveBeenCalled();
        expect(response.status).toBe(502);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        const correlationId = response.headers.get("x-correlation-id");
        expect(await response.json()).toEqual({ error: "Upstream request failed", correlationId });
    });

    test("projects declared JSON through the executor", async () => {
        const response = await executeEndpoint(ep({
            output: [{
                status: "200",
                body: {
                    type: "object",
                    properties: { publicName: { type: "string" } },
                },
            }],
        }), new Request("http://local.test/source"), {
            fetchImpl: mock(async () => new Response(JSON.stringify({
                publicName: "Ada",
                accessToken: "must-not-leak",
            }), { headers: { "content-type": "application/json" } })),
        });

        expect(await response.json()).toEqual({ publicName: "Ada" });
    });

    test("keeps the timeout boundary around a declared response body", async () => {
        const fetchImpl = mock(async () => new Response(new ReadableStream<Uint8Array>({
            pull(controller) {
                const error = new Error("response body timed out");
                error.name = "AbortError";
                controller.error(error);
            },
        }), { headers: { "content-type": "application/json" } }));

        const response = await executeEndpoint(ep({
            output: [{ status: "200", body: { type: "object" } }],
        }), new Request("http://local.test/source"), { fetchImpl });

        expect(response.status).toBe(504);
        expect(await response.text()).toBe("Source Timeout");
    });
});
