import { describe, expect, spyOn, test } from "bun:test";
import { projectEndpointResponse } from "cms-sources/core/response-projection/projectEndpointResponse";
import { nestedResponseEndpoint } from "../../helpers/responseProjectionFixtures";

describe("response projection reporting", () => {
    test("logs safe failures by default but never legacy compatibility events", async () => {
        const error = spyOn(console, "error").mockImplementation(() => {});
        try {
            const source = nestedResponseEndpoint();
            source.targetUrl = "https://api.example.test/orders?credential=default-url-secret";
            source.headers = [
                {
                    name: "X-Private-Header",
                    source: { from: "static", value: "default-config-secret" },
                },
            ];
            const failed = await projectEndpointResponse(
                source,
                new Request("http://local.test/source?email=default-person@example.test", {
                    headers: { "x-request-secret": "default-request-header-secret" },
                }),
                Response.json(
                    {
                        orders: [{ total: "default-body-secret" }],
                        privateValue: "default-extra-body-secret",
                    },
                    { headers: { "x-response-secret": "default-response-header-secret" } },
                ),
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
                { ...nestedResponseEndpoint(), output: undefined },
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
        [
            "throwing",
            () => {
                throw new Error("logger contains private-value");
            },
        ],
        [
            "rejecting",
            async () => {
                throw new Error("logger contains private-value");
            },
        ],
    ])("keeps the generic response when the %s projection reporter fails", async (_name, reporter) => {
        const response = await projectEndpointResponse(
            nestedResponseEndpoint(),
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
