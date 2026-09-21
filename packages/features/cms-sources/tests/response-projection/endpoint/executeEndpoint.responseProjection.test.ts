import { describe, expect, mock, test } from "bun:test";
import { executeEndpoint } from "cms-sources/core/execution/executeEndpoint";
import type { ResponseProjectionEvent } from "cms-sources/core/response-projection/projectEndpointResponse";
import { ep } from "../../helpers/executeEndpointFixtures";

describe("executeEndpoint response projection integration", () => {
    test.each([
        ["missing_output", undefined, 200],
        ["empty_output", [], 200],
        ["unmatched_status", [{ status: "200", body: { type: "object" as const } }], 400],
    ])("rejects %s contracts instead of forwarding upstream content", async (reason, output, status) => {
        let event: ResponseProjectionEvent | undefined;
        const response = await executeEndpoint(ep({ output }), new Request("http://local.test/source?private=value"), {
            fetchImpl: mock(
                async () =>
                    new Response(JSON.stringify({ private: "must-not-leak" }), {
                        status,
                        headers: { "content-type": "application/json" },
                    }),
            ),
            reportResponseProjectionEvent: (reported) => {
                event = reported;
            },
        });

        const correlationId = response.headers.get("x-correlation-id");
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "Upstream request failed", correlationId });
        expect(event).toEqual({
            kind: "response_projection_failure",
            endpointUrn: "urn:x:e",
            upstreamStatus: status,
            reason,
            correlationId,
        });
        expect(JSON.stringify(event)).not.toContain("must-not-leak");
        expect(JSON.stringify(event)).not.toContain("private=value");
    });
});
