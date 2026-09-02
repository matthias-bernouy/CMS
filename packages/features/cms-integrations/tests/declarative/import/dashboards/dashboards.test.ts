import { describe, expect, test } from "bun:test";
import { importIntegration, parseIntegrationDefinition, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { InMemoryDashboardRepository, InMemoryDashboardViewRepository } from "@bernouy/cms-dashboards";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { sourceArtifact } from "../../../helpers";
import { DELIVERY_DEFINITION } from "../fixtures/dashboardDefinitions";
import {
    dashboardArtifact,
    FailingCreateDashboardViewRepository,
    overlayLookupDefinition,
} from "./dashboardImportSupport";

describe("@bernouy/cms-integrations declarative imports", () => {
    test("parses dashboard select options and lookup field definitions", () => {
        const definition = parseIntegrationDefinition(DELIVERY_DEFINITION);

        expect(definition.artifacts?.[1]).toMatchObject({
            type: "dashboard-view",
            view: {
                schemaVersion: 2,
                id: "delivery",
                source: "delivery",
                view: { widgets: [{ widget: "w-detail", id: "shipmentDetail" }] },
            },
        });
    });

    test("parses navigation lists embedded in detail main content", () => {
        const definition = structuredClone(DELIVERY_DEFINITION) as any;
        definition.artifacts[1].dashboard.views[0].main.push({
            widget: "w-navigation-list",
            id: "relayNavigation",
            source: { endpoint: "relayPoints", itemsPath: "items" },
            rowKey: "number",
            item: { title: { path: "name" } },
        });

        const parsed = parseIntegrationDefinition(definition);
        expect((parsed.artifacts?.[1] as any).view.view.widgets[0].main[1].widget).toBe("w-navigation-list");

        definition.artifacts[1].dashboard.views[0].main[1] = {
            widget: "w-table",
            id: "relayTable",
            source: { endpoint: "relayPoints", itemsPath: "items" },
            rowKey: "number",
            columns: [{ id: "name", label: "Name", path: "name" }],
        };
        expect(() => parseIntegrationDefinition(definition)).toThrow(/main\.1\.widget.*w-navigation-list/);
    });

    test("parses safe post-action result resource contracts", () => {
        for (const after of [
            { resource: "$result" },
            { resource: "$result.item" },
            { opens: "shipmentDetail", row: "$result.item.id", resource: "$result.item" },
        ]) {
            const definition = parseIntegrationDefinition(deliveryDefinitionWithAfter(after));
            const dashboard = definition.artifacts?.[1];
            if (dashboard?.type !== "dashboard-view") {
                throw new Error("dashboard artifact not parsed");
            }
            const detail = dashboard.view.view.widgets[0];
            if (detail?.widget !== "w-detail") {
                throw new Error("detail widget not parsed");
            }
            expect(detail.actions?.[0]?.after).toEqual(after);
        }
    });

    test("rejects malformed post-action result resource contracts", () => {
        for (const [after, error] of [
            [{}, /after.*must declare opens or resource/],
            [{ row: "$result.id" }, /after\.row.*requires opens/],
            [{ resource: "$field.item" }, /after\.resource.*safe \$result expression/],
            [{ resource: "$selection.item" }, /after\.resource.*safe \$result expression/],
            [{ resource: "$result.__proto__.item" }, /after\.resource.*safe \$result expression/],
            [{ resource: "$result.constructor.item" }, /after\.resource.*safe \$result expression/],
            [{ resource: "$result.item.prototype" }, /after\.resource.*safe \$result expression/],
        ] as const) {
            expect(() => parseIntegrationDefinition(deliveryDefinitionWithAfter(after))).toThrow(error);
        }
    });

    test("parses local selections and rejects legacy lookup hydration refs", () => {
        const parsed = parseIntegrationDefinition(overlayLookupDefinition("$resource.relayPoint"));
        expect(parsed.artifacts?.[0]).toMatchObject({
            type: "sourceOverlay",
            overlay: { dashboardFields: [{ field: { lookup: { selected: "$resource.relayPoint" } } }] },
        });

        for (const selected of [" ", { endpoint: "relayPoint" }]) {
            const dashboard = structuredClone(DELIVERY_DEFINITION) as any;
            dashboard.artifacts[1].dashboard.views[0].main[0].fields[1].lookup.selected = selected;
            expect(() => parseIntegrationDefinition(dashboard)).toThrow(/selected.*non-empty string/);
            expect(() => parseIntegrationDefinition(overlayLookupDefinition(selected))).toThrow(
                /selected.*non-empty string/,
            );
        }
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

        await expect(
            importIntegration({ sources, secrets }, { kind: "duplicate-sources", answers: {}, options: {} }, [
                definition,
            ]),
        ).rejects.toThrow(/urn:same/);

        expect(await sources.getSource("urn:same")).toBeNull();
    });

    test("imports dashboards declared for sources owned by the same integration", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new InMemoryDashboardRepository();
        const dashboardViews = new InMemoryDashboardViewRepository();
        const definition: IntegrationDefinition = {
            kind: "source-dashboard",
            label: "Source dashboard",
            inputs: [],
            artifacts: [sourceArtifact("items"), dashboardArtifact("items-dashboard", "items")],
        };

        const result = await importIntegration(
            { sources, secrets, dashboards, dashboardViews },
            { kind: "source-dashboard", answers: {}, options: {} },
            [definition],
        );

        expect(result.artifacts).toEqual([
            { type: "source", id: "urn:items", action: "created" },
            { type: "dashboard-view", id: "items-dashboard", action: "created" },
            { type: "dashboard", id: "items-dashboard", action: "created" },
        ]);
        expect(await dashboardViews.getView("items-dashboard")).toMatchObject({
            id: "items-dashboard",
            source: "items",
        });
    });

    test("rejects dashboards targeting sources not declared by the same integration", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new InMemoryDashboardRepository();
        const dashboardViews = new InMemoryDashboardViewRepository();
        const definition: IntegrationDefinition = {
            kind: "foreign-dashboard",
            label: "Foreign dashboard",
            inputs: [],
            artifacts: [sourceArtifact("owned"), dashboardArtifact("bad-dashboard", "foreign")],
        };

        await expect(
            importIntegration(
                { sources, secrets, dashboards, dashboardViews },
                { kind: "foreign-dashboard", answers: {}, options: {} },
                [definition],
            ),
        ).rejects.toThrow(/references source "foreign" not declared by this integration/);

        expect(await sources.getSource("urn:owned")).toBeNull();
        expect(await dashboardViews.getView("bad-dashboard")).toBeNull();
    });

    test("rolls back sources when dashboard writes fail", async () => {
        const sources = new InMemorySourceRepository();
        const secrets = new InMemorySecretStore();
        const dashboards = new InMemoryDashboardRepository();
        const dashboardViews = new FailingCreateDashboardViewRepository("items-dashboard");
        const definition: IntegrationDefinition = {
            kind: "dashboard-fails",
            label: "Dashboard fails",
            inputs: [],
            artifacts: [sourceArtifact("items"), dashboardArtifact("items-dashboard", "items")],
        };

        await expect(
            importIntegration(
                { sources, secrets, dashboards, dashboardViews },
                { kind: "dashboard-fails", answers: {}, options: {} },
                [definition],
            ),
        ).rejects.toThrow(/dashboard view create failed/);

        expect(await sources.getSource("urn:items")).toBeNull();
        expect(await dashboardViews.getView("items-dashboard")).toBeNull();
    });
});

function deliveryDefinitionWithAfter(after: unknown) {
    const definition = structuredClone(DELIVERY_DEFINITION) as any;
    definition.artifacts[1].dashboard.views[0].actions[0].after = after;
    return definition;
}
