import { describe, expect, mock, test } from "bun:test";
import {
    endpointPerformanceHandler,
    parseEndpointPerformanceQuery,
    type EndpointPerformanceReports,
} from "@bernouy/cms-analytics";

describe("endpoint performance HTTP handler", () => {
    test("applies bounded defaults and forwards strict filters", async () => {
        const dashboard = mock(async (query) => ({ meta: { query } }));
        const reports = { dashboard } as EndpointPerformanceReports;
        const response = await endpointPerformanceHandler(
            reports,
            new Request(
                "https://admin.test/api/analytics/endpoints?surface=delivery&endpoint=urn:commerce:products&method=GET&status=2xx",
            ),
        );
        expect(response.status).toBe(200);
        expect(dashboard).toHaveBeenCalledWith({
            range: "24h",
            surface: "delivery",
            endpointUrn: "urn:commerce:products",
            method: "GET",
            statusClass: "2xx",
            sort: "p95",
            order: "desc",
            limit: 50,
        });
    });

    test("rejects unknown, duplicated, unbounded, and malformed values", () => {
        for (const query of [
            "range=30d",
            "surface=worker",
            "endpoint=https://private.test/user",
            "method=CUSTOM",
            "status=200",
            "sort=secret",
            "order=random",
            "limit=0",
            "limit=101",
            "limit=2.5",
            "range=1h&range=7d",
            "unknown=value",
        ]) {
            expect(parseEndpointPerformanceQuery(new URLSearchParams(query))).toBeInstanceOf(Response);
        }
    });

    test("maps report failures to a generic unavailable response", async () => {
        const response = await endpointPerformanceHandler(
            { dashboard: async () => Promise.reject(new Error("mongodb://user:password@private")) },
            new Request("https://admin.test/api/analytics/endpoints"),
        );
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "endpoint performance unavailable" });
    });
});
