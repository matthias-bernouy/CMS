import { describe, expect, test } from "bun:test";
import { importIntegration, parseIntegrationDefinition, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { InMemoryDashboardRepository, type Dashboard } from "@bernouy/cms-dashboards";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { sourceArtifact } from "../helpers";
import { DELIVERY_DEFINITION, EXPECTED_DELIVERY_DASHBOARD } from "./fixtures/dashboardDefinitions";

describe("@bernouy/cms-integrations declarative imports", () => {
    test("parses dashboard select options and lookup field definitions", () => {
        const definition = parseIntegrationDefinition(DELIVERY_DEFINITION);

        expect(definition.artifacts?.[1]).toEqual(EXPECTED_DELIVERY_DASHBOARD);
    });

    test("rejects duplicate source urns within one import before writing", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const definition: IntegrationDefinition = {
            kind: "duplicate-sources",
            label: "Duplicate Sources",
            inputs: [],
            artifacts: [sourceArtifact("same"), sourceArtifact("same")],
        };

        await expect(importIntegration(
            { sources, secrets },
            { kind: "duplicate-sources", answers: {}, options: {} },
            [definition],
        )).rejects.toThrow(/urn:same/);

        expect(await sources.getSource("urn:same")).toBeNull();
    });

    test("imports dashboards declared for sources owned by the same integration", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new InMemoryDashboardRepository();
        const definition: IntegrationDefinition = {
            kind: "source-dashboard",
            label: "Source dashboard",
            inputs: [],
            artifacts: [
                sourceArtifact("items"),
                dashboardArtifact("items-dashboard", "items"),
            ],
        };

        const result = await importIntegration(
            { sources, secrets, dashboards },
            { kind: "source-dashboard", answers: {}, options: {} },
            [definition],
        );

        expect(result.artifacts).toEqual([
            { type: "source", id: "urn:items", action: "created" },
            { type: "dashboard", id: "items-dashboard", action: "created" },
        ]);
        expect(await dashboards.getDashboard("items-dashboard")).toEqual(dashboardArtifact("items-dashboard", "items").dashboard);
    });

    test("rejects dashboards targeting sources not declared by the same integration", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new InMemoryDashboardRepository();
        const definition: IntegrationDefinition = {
            kind: "foreign-dashboard",
            label: "Foreign dashboard",
            inputs: [],
            artifacts: [
                sourceArtifact("owned"),
                dashboardArtifact("bad-dashboard", "foreign"),
            ],
        };

        await expect(importIntegration(
            { sources, secrets, dashboards },
            { kind: "foreign-dashboard", answers: {}, options: {} },
            [definition],
        )).rejects.toThrow(/references source "foreign" not declared by this integration/);

        expect(await sources.getSource("urn:owned")).toBeNull();
        expect(await dashboards.getDashboard("bad-dashboard")).toBeNull();
    });

    test("rolls back sources when dashboard writes fail", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new FailingCreateDashboardRepository("items-dashboard");
        const definition: IntegrationDefinition = {
            kind: "dashboard-fails",
            label: "Dashboard fails",
            inputs: [],
            artifacts: [
                sourceArtifact("items"),
                dashboardArtifact("items-dashboard", "items"),
            ],
        };

        await expect(importIntegration(
            { sources, secrets, dashboards },
            { kind: "dashboard-fails", answers: {}, options: {} },
            [definition],
        )).rejects.toThrow(/dashboard create failed/);

        expect(await sources.getSource("urn:items")).toBeNull();
        expect(await dashboards.getDashboard("items-dashboard")).toBeNull();
    });
});

function dashboardArtifact(id: string, source: string) {
    return {
        type: "dashboard" as const,
        dashboard: {
            id,
            source,
            views: [
                {
                    widget: "w-table" as const,
                    id: "itemsTable",
                    source: { endpoint: "list", itemsPath: "items" },
                    rowKey: "id",
                    columns: [{ id: "id", label: "ID", path: "id" }],
                },
            ],
        },
    };
}

class FailingCreateDashboardRepository extends InMemoryDashboardRepository {
    constructor(private readonly failId: string) {
        super();
    }

    override createDashboard(dashboard: Dashboard): Promise<Dashboard> {
        if (dashboard.id === this.failId) throw new Error(`dashboard create failed for ${dashboard.id}`);
        return super.createDashboard(dashboard);
    }
}
