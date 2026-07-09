import { describe, expect, test } from "bun:test";
import type { IntegrationInstallation } from "@bernouy/cms-integrations";
import {
    buildIntegrationInstallationView,
    type IntegrationArtifactContext,
} from "cms-control/core/integrations/installationViews";

describe("buildIntegrationInstallationView", () => {
    test("marks relation artifacts with their labels and availability", () => {
        const now = new Date("2026-01-01T10:00:00Z");
        const installation = {
            id: "products-offers-link",
            label: "Products offers link",
            definitionVersion: "1.0.0",
            status: "success",
            createdAt: now,
            updatedAt: now,
            runCount: 0,
            answersSnapshot: {},
            secretRefs: {},
            secretInputs: [],
            runs: [],
            artifacts: [
                { type: "sourceOverlay", id: "offers-product-lookup", action: "created" },
                { type: "relation", id: "product-offers", action: "created" },
                { type: "dashboardRelation", id: "products-products:productDetail:product-offers", action: "created" },
            ],
        } satisfies IntegrationInstallation;
        const context: IntegrationArtifactContext = {
            sourceUrns: new Set(),
            sourceOverlayIds: new Set(["offers-product-lookup"]),
            functionIds: new Set(),
            dashboardIds: new Set(),
            relationIds: new Set(["product-offers"]),
            dashboardRelationProjectionIds: new Set(["products-products:productDetail:product-offers"]),
            blocIds: new Set(),
        };

        const view = buildIntegrationInstallationView(context, installation, false);

        expect(view.missingArtifactCount).toBe(0);
        expect(view.artifacts.map((artifact) => artifact.exists)).toEqual([true, true, true]);
        expect(view.artifacts.map((artifact) => artifact.typeLabel)).toEqual([
            "Source overlay",
            "Relation",
            "Dashboard relation",
        ]);
    });
});
