import { describe, expect, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemoryAnalyticsStore } from "@bernouy/cms-analytics";
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

        for (const path of ["summary", "timeseries", "top-pages", "breakdown", "referrers", "flows", "health"]) {
            expect(runner.endpoints.get(`GET /api/analytics/${path}`)).toBe(1);
        }

        const health = runner.handlers.get("GET /api/analytics/health");
        const response = await health!(new Request("http://control/api/analytics/health?range=24h"));
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            requests: 0,
            notFound: 0,
            clientErrors: 0,
            serverErrors: 0,
            avgMs: 0,
            maxMs: 0,
        });
    });
});
