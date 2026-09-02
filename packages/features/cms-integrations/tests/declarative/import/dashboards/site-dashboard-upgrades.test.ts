import { describe, expect, test } from "bun:test";
import {
    InMemoryDashboardRepository,
    InMemoryDashboardViewRepository,
    type DashboardDefinition,
} from "@bernouy/cms-dashboards";
import {
    InMemoryIntegrationInstallationRepository,
    runIntegrationInstallation,
    type IntegrationDefinition,
    type IntegrationInstallationRepository,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { SuccessReplaceFailingIntegrationInstallationRepository } from "../../../helpers";

describe("site dashboards across integration view upgrades", () => {
    test("repins and recompiles a published site dashboard", async () => {
        const context = await installedContext();
        await context.dashboards.createDashboard(siteDashboard());

        await upgrade(context, integrationDefinition("2.0.0", true, "https://api.example.com/v2/items"));

        const dashboard = await context.dashboards.getDashboard("support");
        expect(dashboard?.views[0]?.revision).toBe("2.0.0:catalog");
        expect(dashboard?.revision).toBe("2");
        expect(dashboard?.executionPlan).toEqual({
            dashboardId: "support",
            revision: "2",
            allowedCalls: [{ sourceId: "catalog", endpointId: "list", method: "GET" }],
        });
    });

    test("blocks removal while a site dashboard still mounts the view", async () => {
        const context = await installedContext();
        await context.dashboards.createDashboard(siteDashboard());

        await expect(upgrade(context, integrationDefinition("2.0.0", false))).rejects.toThrow(
            /site dashboard "Support" uses removed dashboard view "catalog" at "Catalogue"/,
        );

        expect((await context.dashboardViews.getView("catalog"))?.revision).toBe("1.0.0:catalog");
        expect((await context.dashboards.getDashboard("support"))?.views[0]?.revision).toBe("1.0.0:catalog");
        expect((await context.installations.get("catalog-integration"))?.definitionVersion).toBe("1.0.0");
    });

    test("rolls back the repin when installation persistence fails", async () => {
        const context = await installedContext(new SuccessReplaceFailingIntegrationInstallationRepository());
        await context.dashboards.createDashboard(siteDashboard());

        await expect(upgrade(context, integrationDefinition("2.0.0", true))).rejects.toThrow(
            /installation replace failed/,
        );

        expect((await context.dashboardViews.getView("catalog"))?.revision).toBe("1.0.0:catalog");
        expect((await context.dashboards.getDashboard("support"))?.views[0]?.revision).toBe("1.0.0:catalog");
        expect((await context.sources.getSource("urn:catalog"))?.endpoints[0]?.targetUrl).toContain("/v1/");
    });
});

async function installedContext(
    installations: IntegrationInstallationRepository = new InMemoryIntegrationInstallationRepository(),
) {
    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const dashboards = new InMemoryDashboardRepository();
    const dashboardViews = new InMemoryDashboardViewRepository();
    const definition = integrationDefinition("1.0.0", true, "https://api.example.com/v1/items");
    await runIntegrationInstallation({
        mode: "create",
        deps: { sources, secrets, dashboards, dashboardViews },
        installations,
        siteIntegrations: [definition],
        dto: { kind: definition.kind, answers: {}, options: {} },
    });
    return { sources, secrets, dashboards, dashboardViews, installations };
}

type Context = Awaited<ReturnType<typeof installedContext>>;

function upgrade(context: Context, targetDefinition: IntegrationDefinition) {
    return runIntegrationInstallation({
        mode: "upgrade",
        deps: {
            sources: context.sources,
            secrets: context.secrets,
            dashboards: context.dashboards,
            dashboardViews: context.dashboardViews,
        },
        installations: context.installations,
        integrationId: "catalog-integration",
        targetDefinition,
    });
}

function integrationDefinition(version: string, withView: boolean, targetUrl = "https://api.example.com/v2/items") {
    return {
        kind: "catalog-integration",
        label: "Catalog integration",
        version,
        inputs: [],
        artifacts: [
            {
                type: "source" as const,
                source: {
                    id: "catalog",
                    meta: { name: "Catalog" },
                    endpoints: [
                        {
                            endpointId: "list",
                            method: "GET" as const,
                            targetUrl,
                            params: [],
                            output: [{ status: "200" as const, body: { type: "object" as const } }],
                        },
                    ],
                },
            },
            ...(withView ? [viewArtifact()] : []),
        ],
    } satisfies IntegrationDefinition;
}

function viewArtifact() {
    return {
        type: "dashboard-view" as const,
        view: {
            schemaVersion: 2 as const,
            id: "catalog",
            source: "catalog",
            meta: { name: "Catalog" },
            view: {
                id: "catalog",
                label: "Catalog",
                widgets: [
                    {
                        widget: "w-table" as const,
                        id: "catalogTable",
                        source: { endpoint: "list", itemsPath: "items" },
                        rowKey: "id",
                        columns: [{ id: "id", label: "ID", path: "id" }],
                    },
                ],
            },
            availability: { catalog: true },
        },
    };
}

function siteDashboard(): DashboardDefinition {
    return {
        schemaVersion: 2,
        id: "support",
        meta: { name: "Support", icon: "life-buoy" },
        homeView: "catalogue",
        views: [
            {
                id: "catalogue",
                label: "Catalogue",
                icon: "database",
                use: "catalog",
                revision: "1.0.0:catalog",
            },
        ],
        origin: { kind: "site", createdBy: "admin-1" },
        status: "published",
        revision: "1",
    };
}
