import { describe, expect, mock, test } from "bun:test";
import { executeEndpoint } from "cms-sources/core/execution/executeEndpoint";
import type { ResponseProjectionEvent } from "cms-sources/core/response-projection/projectEndpointResponse";
import { nestedResponseEndpoint } from "../../helpers/responseProjectionFixtures";

describe("response projection diagnostics", () => {
    test("reports only correlated type and normalized contract-path metadata", async () => {
        const events: ResponseProjectionEvent[] = [];
        const endpoint = nestedResponseEndpoint();
        endpoint.targetUrl = "https://api.example.test/orders?credential=url-secret";
        endpoint.headers = [{ name: "Authorization", source: { from: "static", value: "header-secret" } }];
        endpoint.input = {
            params: [
                {
                    name: "customerEmail",
                    in: "query",
                    schema: { type: "string" },
                },
            ],
        };
        const response = await executeEndpoint(
            endpoint,
            new Request("http://local.test/source?customerEmail=person@example.test"),
            {
                fetchImpl: mock(async () =>
                    Response.json(
                        {
                            orders: [{ total: 10 }, { total: null }],
                            providerBodySecret: "body-secret",
                        },
                        { headers: { "x-provider-secret": "response-header-secret" } },
                    ),
                ),
                reportResponseProjectionEvent: (event) => events.push(event),
            },
        );

        const correlationId = response.headers.get("x-correlation-id");
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "Upstream request failed", correlationId });
        expect(events).toEqual([
            {
                kind: "response_projection_failure",
                endpointUrn: "urn:orders:list",
                upstreamStatus: 200,
                reason: "type_mismatch",
                correlationId,
                path: "$.orders[].total",
                expectedType: "number",
                actualType: "null",
            },
        ]);
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
        const endpoint = nestedResponseEndpoint();
        endpoint.output![0]!.body!.properties!.orders.items!.properties!.total.nullable = true;
        const response = await executeEndpoint(endpoint, new Request("http://local.test/source"), {
            fetchImpl: mock(async () => Response.json({ orders: [{ total: null, private: "drop" }] })),
            reportResponseProjectionEvent: (event) => events.push(event),
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ orders: [{ total: null }] });
        expect(events).toEqual([]);
    });
});
