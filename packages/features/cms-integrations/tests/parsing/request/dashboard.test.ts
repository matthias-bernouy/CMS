import { describe, expect, test } from "bun:test";
import { parseIntegrationImportRequest } from "@bernouy/cms-integrations";
import { EXPECTED_MANUAL_DASHBOARD_ARTIFACT } from "./expectedManualDashboard";
import { MANUAL_DASHBOARD_DEFINITION } from "./manualDashboardDefinition";

describe("@bernouy/cms-integrations dashboard DTO parsing", () => {
    test("parses manual dashboard artifacts before import execution", () => {
        const request = parseIntegrationImportRequest({
            definition: MANUAL_DASHBOARD_DEFINITION,
            answers: {},
        });

        const artifact = request.siteIntegrations[0]?.artifacts?.[0];
        expect(artifact).toMatchObject({
            type: "dashboard-view",
            view: {
                schemaVersion: 2,
                id: EXPECTED_MANUAL_DASHBOARD_ARTIFACT.dashboard.id,
                source: EXPECTED_MANUAL_DASHBOARD_ARTIFACT.dashboard.source,
                meta: EXPECTED_MANUAL_DASHBOARD_ARTIFACT.dashboard.meta,
            },
        });
        expect(artifact?.type === "dashboard-view" ? artifact.view.view.widgets : null).toEqual(
            EXPECTED_MANUAL_DASHBOARD_ARTIFACT.dashboard.views,
        );
    });
});
