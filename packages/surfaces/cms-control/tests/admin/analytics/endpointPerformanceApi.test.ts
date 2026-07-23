import { describe, expect, test } from "bun:test";
import { readEndpointPerformanceQuery } from "cms-control/components/admin/Layout/EndpointPerformance/api";

describe("endpoint performance query state", () => {
    test("accepts only the operational dashboard allowlists", () => {
        expect(
            readEndpointPerformanceQuery(
                "?range=1h&surface=delivery&endpoint=urn%3Acommerce%3Alist_orders&method=POST&status=5xx&sort=requests&order=asc&limit=25",
            ),
        ).toEqual({
            range: "1h",
            surface: "delivery",
            endpointUrn: "urn:commerce:list_orders",
            method: "POST",
            statusClass: "5xx",
            sort: "requests",
            order: "asc",
            limit: 25,
        });
    });

    test("falls back safely for unknown ranges, filters, sorting, and endpoints", () => {
        expect(
            readEndpointPerformanceQuery(
                "?range=30d&surface=worker&endpoint=%3Cscript%3E&method=TRACE&status=600&sort=average&order=sideways&limit=1000",
            ),
        ).toEqual({
            range: "24h",
            sort: "p95",
            order: "desc",
            limit: 50,
        });
    });
});
