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

        expect(request.siteIntegrations[0]?.artifacts?.[0]).toEqual(EXPECTED_MANUAL_DASHBOARD_ARTIFACT);
    });
});
