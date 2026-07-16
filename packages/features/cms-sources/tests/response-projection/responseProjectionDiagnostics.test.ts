import { describe, expect, mock, spyOn, test } from "bun:test";
import { executeEndpoint } from "cms-sources/core/executeEndpoint";
import {
    projectEndpointResponse,
    type ResponseProjectionEvent,
} from "cms-sources/core/response-projection/projectEndpointResponse";
import type { SourceEndpoint } from "cms-sources/interfaces/Source";

describe("response projection diagnostics", () => {
    test("reports only correlated type and normalized contract-path metadata", async () => {
        const events: ResponseProjectionEvent[] = [];
        const endpoint = nestedEndpoint();
        endpoint.targetUrl = "https://api.example.test/orders?credential=url-secret";
        endpoint.headers = [{ name: "Authorization", source: { from: "static", value: "header-secret" } }];
        endpoint.input = {
            params: [{
                name: "customerEmail",
                in: "query",
                schema: { type: "string" },
            }],
        };
        const response = await executeEndpoint(
            endpoint,
            new Request("http://local.test/source?customerEmail=person@example.test"),
            {
                fetchImpl: mock(async () => Response.json({
                    orders: [{ total: 10 }, { total: null }],
                    providerBodySecret: "body-secret",
                }, { headers: { "x-provider-secret": "response-header-secret" } })),
                reportResponseProjectionEvent: event => events.push(event),
            },
        );

        const correlationId = response.headers.get("x-correlation-id");
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "Upstream request failed", correlationId });
        expect(events).toEqual([{
            kind: "response_projection_failure",
            endpointUrn: "urn:orders:list",
            upstreamStatus: 200,
            reason: "type_mismatch",
            correlationId,
            path: "$.orders[].total",
            expectedType: "number",
            actualType: "null",
        }]);
        expect(Object.keys(events[0]!).sort()).toEqual([
            "actualType",
            "correlationId",
            "endpointUrn",
            "expectedType",
            "kind",
            "path",
            "reason",
            "upstreamStatus",
        ]);
        const diagnostic = JSON.stringify(events);
        for (const privateValue of [
            "url-secret",
            "header-secret",
            "person@example.test",
            "body-secret",
            "response-header-secret",
        ]) {
            expect(diagnostic).not.toContain(privateValue);
        }
        expect(diagnostic).not.toContain("[1]");
    });

    test("keeps explicitly nullable values successful and silent", async () => {
        const events: ResponseProjectionEvent[] = [];
        const endpoint = nestedEndpoint();
        endpoint.output![0]!.body!.properties!.orders.items!.properties!.total.nullable = true;
        const response = await executeEndpoint(endpoint, new Request("http://local.test/source"), {
            fetchImpl: mock(async () => Response.json({ orders: [{ total: null, private: "drop" }] })),
            reportResponseProjectionEvent: event => events.push(event),
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ orders: [{ total: null }] });
        expect(events).toEqual([]);
    });

    test("logs safe failures by default but never legacy compatibility events", async () => {
        const error = spyOn(console, "error").mockImplementation(() => {});
        try {
            const source = nestedEndpoint();
            source.targetUrl = "https://api.example.test/orders?credential=default-url-secret";
            source.headers = [{
                name: "X-Private-Header",
                source: { from: "static", value: "default-config-secret" },
            }];
            const failed = await projectEndpointResponse(
                source,
                new Request("http://local.test/source?email=default-person@example.test", {
                    headers: { "x-request-secret": "default-request-header-secret" },
                }),
                Response.json({
                    orders: [{ total: "default-body-secret" }],
                    privateValue: "default-extra-body-secret",
                }, { headers: { "x-response-secret": "default-response-header-secret" } }),
            );
            const correlationId = failed.headers.get("x-correlation-id");
            expect(error).toHaveBeenCalledTimes(1);
            const logged = String(error.mock.calls[0]![0]);
            expect(JSON.parse(logged)).toEqual({
                scope: "cms-sources",
                kind: "response_projection_failure",
                endpointUrn: "urn:orders:list",
                upstreamStatus: 200,
                reason: "type_mismatch",
                correlationId,
                path: "$.orders[].total",
                expectedType: "number",
                actualType: "string",
            });
            for (const privateValue of [
                "default-url-secret",
                "default-config-secret",
                "default-person@example.test",
                "default-request-header-secret",
                "default-body-secret",
                "default-extra-body-secret",
                "default-response-header-secret",
            ]) {
                expect(logged).not.toContain(privateValue);
            }

            const legacy = await projectEndpointResponse(
                { ...nestedEndpoint(), output: undefined },
                new Request("http://local.test/source"),
                new Response("legacy body"),
            );
            expect(await legacy.text()).toBe("legacy body");
            expect(error).toHaveBeenCalledTimes(1);
        } finally {
            error.mockRestore();
        }
    });

    test.each([
        ["throwing", () => { throw new Error("logger contains private-value"); }],
        ["rejecting", async () => { throw new Error("logger contains private-value"); }],
    ])("keeps the generic response when the %s projection reporter fails", async (_name, reporter) => {
        const response = await projectEndpointResponse(
            nestedEndpoint(),
            new Request("http://local.test/source"),
            Response.json({ orders: [{ total: "private-value" }] }),
            { reportResponseProjectionEvent: reporter },
        );
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({
            error: "Upstream request failed",
            correlationId: response.headers.get("x-correlation-id"),
        });
    });
});

function nestedEndpoint(): SourceEndpoint {
    return {
        urn: "urn:orders:list",
        method: "GET",
        targetUrl: "https://api.example.test/orders",
        output: [{
            status: "200",
            body: {
                type: "object",
                properties: {
                    orders: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: { total: { type: "number" } },
                        },
                    },
                },
            },
        }],
    };
}
