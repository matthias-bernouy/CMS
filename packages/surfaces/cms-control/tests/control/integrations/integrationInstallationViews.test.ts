import { describe, expect, test } from "bun:test";
import type { IntegrationInstallation } from "@bernouy/cms-integrations";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import {
    buildIntegrationInstallationView,
    loadIntegrationArtifactContext,
    type IntegrationArtifactContext,
} from "cms-control/core/management/integrations/presentation/installationViews";
import { makeCms } from "./support/helpers";

describe("buildIntegrationInstallationView", () => {
    test("exposes resumable migration state only in the authenticated detail view", () => {
        const now = new Date("2026-01-01T10:00:00Z");
        const installation = {
            id: "commerce",
            label: "Commerce",
            definitionVersion: "1.0.0",
            status: "failed",
            createdAt: now,
            updatedAt: now,
            runCount: 1,
            answersSnapshot: {},
            secretRefs: {},
            secretInputs: [],
            activeResources: ["ulvia/blocs/basic-paragraph"],
            runs: [],
            artifacts: [],
            migrationOperation: {
                id: "migration-1",
                revision: 2,
                status: "paused",
                currentVersion: "1.0.0",
                targetVersion: "1.1.0",
                targetPackageDigest: "a".repeat(64),
                sourceDefinition: { kind: "commerce", name: "Commerce", version: "1.0.0" },
                targetDefinition: { kind: "commerce", name: "Commerce", version: "1.1.0" },
                connectors: [],
                attemptId: "attempt-1",
                fencingToken: 1,
                leaseExpiresAt: now,
                startedAt: now,
                updatedAt: now,
                journal: [
                    {
                        id: "expand",
                        phase: "expand",
                        targetDigest: "b".repeat(64),
                        idempotencyKey: "c".repeat(64),
                        status: "failed",
                        error: { message: "audit fault" },
                    },
                ],
            },
        } as unknown as IntegrationInstallation;
        const context = emptyContext();

        expect(buildIntegrationInstallationView(context, installation, false)).not.toHaveProperty("migrationOperation");
        const detail = buildIntegrationInstallationView(context, installation, true);
        expect(detail.activeResources).toEqual(["ulvia/blocs/basic-paragraph"]);
        expect(detail.migrationOperation).toEqual({
            id: "migration-1",
            revision: 2,
            status: "paused",
            currentVersion: "1.0.0",
            targetVersion: "1.1.0",
            startedAt: now,
            updatedAt: now,
            activatedAt: undefined,
            pointOfNoReturnReachedAt: undefined,
            journal: [{ phase: "expand", status: "failed", error: { message: "audit fault" } }],
        });
    });

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
            triggerIds: new Set(),
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

    test("reconciles trigger artifacts without changing other artifact scopes", () => {
        const now = new Date("2026-01-01T10:00:00Z");
        const installation = {
            id: "catalog-workflow",
            label: "Catalog workflow",
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
                { type: "source", id: "urn:catalog", action: "created" },
                { type: "function", id: "publishCatalog", action: "created" },
                { type: "bloc", id: "catalog-card", action: "created" },
                { type: "trigger", id: "trigger-present", action: "created" },
                { type: "trigger", id: "trigger-missing", action: "created" },
            ],
        } satisfies IntegrationInstallation;
        const context: IntegrationArtifactContext = {
            sourceUrns: new Set(["urn:catalog", "trigger-missing"]),
            sourceOverlayIds: new Set(),
            functionIds: new Set(["publishCatalog"]),
            dashboardIds: new Set(),
            relationIds: new Set(),
            dashboardRelationProjectionIds: new Set(),
            blocIds: new Set(["catalog-card"]),
            triggerIds: new Set(["trigger-present"]),
        };

        const view = buildIntegrationInstallationView(context, installation, false);

        expect(view.artifacts.map((artifact) => artifact.exists)).toEqual([true, true, true, true, false]);
        expect(view.missingArtifactCount).toBe(1);
    });

    test("loads trigger ids from the configured trigger repository", async () => {
        const { cms } = makeCms();
        const triggers = new InMemoryTriggerRepository();
        cms.triggers = triggers;
        await triggers.createTrigger({
            id: "catalog-published",
            enabled: true,
            event: { kind: "endpoint", source: "catalog", endpoint: "publish", phase: "response" },
            function: { id: "notifyCatalogPublished" },
        });

        const context = await loadIntegrationArtifactContext(cms);

        expect(context.triggerIds).toEqual(new Set(["catalog-published"]));
    });
});

function emptyContext(): IntegrationArtifactContext {
    return {
        sourceUrns: new Set(),
        sourceOverlayIds: new Set(),
        functionIds: new Set(),
        dashboardIds: new Set(),
        relationIds: new Set(),
        dashboardRelationProjectionIds: new Set(),
        blocIds: new Set(),
        triggerIds: new Set(),
    };
}
