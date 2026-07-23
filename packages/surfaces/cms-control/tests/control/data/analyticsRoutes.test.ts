import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import {
    InMemoryAnalyticsStore,
    type EndpointPerformanceDashboard,
    type EndpointPerformanceQuery,
} from "@bernouy/cms-analytics";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { ControlCms } from "cms-control/ControlCms";
import type { CMS_ROLES } from "types/roles";
import { CaptureRunner } from "../access/authPublicSupport";

describe("Control analytics routes", () => {
    test("mounts every counter report behind the admin guard", async () => {
        const runner = new CaptureRunner();
        const analytics = new InMemoryAnalyticsStore();
        const cms = new ControlCms(
            runner,
            new InMemoryCmsRepository(),
            new InMemoryAuthentication<CMS_ROLES>({ role: "admin" }),
            {},
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            analytics,
        );
        await cms.ready;

        for (const path of [
            "summary",
            "timeseries",
            "top-pages",
            "entries",
            "breakdown",
            "referrers",
            "flows",
            "health",
            "settings",
            "compliance",
        ]) {
            expect(runner.endpoints.get(`GET /api/analytics/${path}`)).toBe(1);
        }
        expect(runner.endpoints.get("POST /api/analytics/settings")).toBe(1);
        expect(runner.endpoints.get("POST /api/analytics/compliance/snapshots")).toBe(1);

        const health = runner.handlers.get("GET /api/analytics/health");
        const response = await health!(new Request("http://control/api/analytics/health?range=24h"));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            data: {
                requests: 0,
                notFound: 0,
                clientErrors: 0,
                serverErrors: 0,
                avgMs: null,
                maxMs: null,
            },
            meta: { profile: "privacy-strict", threshold: 10 },
        });
    });

    test("mounts endpoint performance independently behind the admin guard", async () => {
        const runner = new CaptureRunner();
        const queries: EndpointPerformanceQuery[] = [];
        const dashboard = emptyEndpointDashboard();
        const cms = new ControlCms(
            runner,
            new InMemoryCmsRepository(),
            new InMemoryAuthentication<CMS_ROLES>({ role: "admin" }),
            {
                endpointPerformanceReports: {
                    async dashboard(query) {
                        queries.push(query);
                        return dashboard;
                    },
                },
            },
        );
        await cms.ready;

        expect(runner.endpoints.get("GET /api/analytics/endpoints")).toBe(1);
        const handler = runner.handlers.get("GET /api/analytics/endpoints");
        const response = await handler!(new Request("http://control/api/analytics/endpoints?range=1h&limit=25"));
        expect(response.status).toBe(200);
        expect(queries).toEqual([
            {
                range: "1h",
                sort: "p95",
                order: "desc",
                limit: 25,
            },
        ]);
    });
});

function emptyEndpointDashboard(): EndpointPerformanceDashboard {
    const now = new Date("2026-07-23T12:00:00.000Z");
    return {
        summary: { requests: 0, errors: 0, errorRate: 0, p50Ms: null, p95Ms: null, p99Ms: null, maxMs: null },
        timeline: [],
        endpoints: [],
        detail: null,
        meta: {
            query: { range: "1h", sort: "p95", order: "desc", limit: 25 },
            generatedAt: now,
            from: now,
            to: now,
            bucketMs: 300_000,
            histogramBoundsMs: [],
            lastObservationAt: null,
            lastFlushAt: null,
            accepted: 0,
            dropped: 0,
            invalid: 0,
            flushFailures: 0,
            partial: false,
            stale: false,
        },
    };
}
