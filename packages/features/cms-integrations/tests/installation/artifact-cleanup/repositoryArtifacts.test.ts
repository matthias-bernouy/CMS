import { describe, expect, test } from "bun:test";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { runIntegrationInstallation, InMemoryIntegrationInstallationRepository } from "@bernouy/cms-integrations";
import { InMemoryRelationRepository } from "@bernouy/cms-relations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceOverlayRepository, InMemorySourceRepository } from "@bernouy/cms-sources";
import { InMemoryTriggerRepository } from "@bernouy/cms-triggers";
import { runtimeArtifactsDefinition } from "./cleanupDefinitions";

describe("@bernouy/cms-integrations obsolete artifact cleanup", () => {
    test("cleans every repository-backed artifact type", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const triggers = new InMemoryTriggerRepository();
        const dashboards = new InMemoryDashboardRepository();
        const sourceOverlays = new InMemorySourceOverlayRepository();
        const relations = new InMemoryRelationRepository();
        const secrets = new InMemorySecretStore();
        const installations = new InMemoryIntegrationInstallationRepository();
        const previous = runtimeArtifactsDefinition("1.0.0", true);
        const current = runtimeArtifactsDefinition("2.0.0", false);
        const deps = { sources, functions, triggers, dashboards, sourceOverlays, relations, secrets };

        await runIntegrationInstallation({
            mode: "create",
            deps,
            installations,
            siteIntegrations: [previous],
            dto: { kind: previous.kind, answers: {}, options: {} },
        });
        await runIntegrationInstallation({
            mode: "upgrade",
            deps,
            installations,
            integrationId: current.kind,
            targetDefinition: current,
        });

        expect(await sources.getSource("urn:products")).toBeNull();
        expect(await sources.getSource("urn:offers")).toBeNull();
        expect(await functions.getFunction("syncOffers")).toBeNull();
        expect(await triggers.getTrigger("sync-offers")).toBeNull();
        expect(await dashboards.getDashboard("products")).toBeNull();
        expect(await sourceOverlays.getOverlay("product-offers-fields")).toBeNull();
        expect(await relations.getRelation("product-offers")).toBeNull();
        expect(await relations.getDashboardRelationProjection("products:productDetail:product-offers")).toBeNull();
    });
});
