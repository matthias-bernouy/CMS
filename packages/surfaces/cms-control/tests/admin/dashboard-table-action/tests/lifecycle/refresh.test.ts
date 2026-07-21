import { describe, expect, test } from "bun:test";
import { runDashboardWidgetAction } from "../../../../../src/components/admin/Resources/Dashboards/DashboardViewActions";
import { DetailResourceState } from "../../../../../src/components/admin/Resources/Dashboards/domain";
import { withActionResource } from "../../dashboard";
import {
    emailerDashboard,
    emailerDashboardWithSameTarget,
    overlappingSchemaActions,
    schemaInvalidatingEmailerGroup,
} from "../../fixtures/emailer";
import { setupDashboardActionTests } from "../../setup";
import { type RecordedDetailResource, resourceActionContext } from "../../support";

setupDashboardActionTests();

describe("dashboard table actions", () => {
    test("lets a schema reload own the current detail refresh", async () => {
        const updated = { provider: "supabase", smtpHost: "smtp.saved.test" };
        globalThis.fetch = (async () => Response.json(updated)) as unknown as typeof fetch;
        const resources: RecordedDetailResource[] = [];
        const reloaded: Array<{ collection: string; row: string }> = [];
        let definitionReloads = 0;
        let renders = 0;
        const context = resourceActionContext({
            dashboard: withActionResource(emailerDashboard(), "emailerSettings", "saveSettings", "$result"),
            group: schemaInvalidatingEmailerGroup(),
            detail: { collection: "emailerSettings", row: "default" },
            resources,
            render: () => {
                renders += 1;
            },
            async reloadDefinitions() {
                definitionReloads += 1;
            },
            reload(collection, row) {
                reloaded.push({ collection, row });
            },
        });

        await runDashboardWidgetAction(context, {
            action: "saveSettings",
            resource: { provider: "supabase", smtpHost: "smtp.old.test" },
            fields: { smtpHost: "smtp.saved.test" },
        });

        expect(definitionReloads).toBe(1);
        expect(resources).toEqual([]);
        expect(reloaded).toEqual([]);
        expect(renders).toBe(1);
    });

    test("renders once when schema invalidation keeps the same detail target", async () => {
        globalThis.fetch = (async () =>
            Response.json({ provider: "supabase", smtpHost: "smtp.saved.test" })) as unknown as typeof fetch;
        const opened: Array<{ collection: string; row: string }> = [];
        let renders = 0;
        let definitionReloads = 0;
        const context = resourceActionContext({
            dashboard: emailerDashboardWithSameTarget(),
            group: schemaInvalidatingEmailerGroup(),
            detail: { collection: "emailerSettings", row: "default" },
            resources: [],
            render: () => {
                renders += 1;
            },
            reload() {
                throw new Error("reload should not run");
            },
            openDetail: (collection, row) => opened.push({ collection, row }),
            async reloadDefinitions() {
                definitionReloads += 1;
            },
        });

        await runDashboardWidgetAction(context, {
            action: "saveSettings",
            resource: { provider: "supabase", smtpHost: "smtp.old.test" },
            fields: { smtpHost: "smtp.saved.test" },
        });

        expect({ definitionReloads, renders, opened }).toEqual({ definitionReloads: 1, renders: 1, opened: [] });
    });

    test("restores an invalidating action target after an overlapping action opens another detail", async () => {
        const responses: Array<(response: Response) => void> = [];
        globalThis.fetch = (() =>
            new Promise<Response>((resolve) => responses.push(resolve))) as unknown as typeof fetch;
        const { dashboard, group } = overlappingSchemaActions();
        const opened: Array<{ collection: string; row: string }> = [];
        let renders = 0;
        const context = resourceActionContext({
            dashboard,
            group,
            detail: { collection: "emailerSettings", row: "default" },
            resources: [],
            render: () => {
                renders += 1;
            },
            async reloadDefinitions() {},
            reload() {
                throw new Error("reload should not run");
            },
            openDetail: (collection, row) => opened.push({ collection, row }),
        });

        const invalidating = runDashboardWidgetAction(context, { action: "saveSettings", resource: {} });
        const overlapping = runDashboardWidgetAction(context, { action: "openDelivery", resource: {} });
        responses[1]!(Response.json({ id: "delivery-1" }));
        await overlapping;
        responses[0]!(Response.json({ provider: "supabase", smtpHost: "smtp.saved.test" }));
        await invalidating;

        expect(opened).toEqual([
            { collection: "deliveryDetail", row: "delivery-1" },
            { collection: "emailerSettings", row: "default" },
        ]);
        expect(renders).toBe(0);
    });

    test("remounts refreshed definitions instead of reloading an old detail after overlap", async () => {
        globalThis.fetch = (async () =>
            Response.json({ provider: "supabase", smtpHost: "smtp.saved.test" })) as unknown as typeof fetch;
        const actionCoordinator = new DetailResourceState();
        const finishOverlapping = actionCoordinator.beginAction();
        const reloaded: Array<{ collection: string; row: string }> = [];
        let renders = 0;
        const context = resourceActionContext({
            dashboard: emailerDashboard(),
            group: schemaInvalidatingEmailerGroup(),
            detail: { collection: "emailerSettings", row: "default" },
            resources: [],
            actionCoordinator,
            render: () => {
                renders += 1;
            },
            async reloadDefinitions() {},
            reload: (collection, row) => reloaded.push({ collection, row }),
        });

        await runDashboardWidgetAction(context, { action: "saveSettings", resource: {} });
        finishOverlapping();

        expect(reloaded).toEqual([]);
        expect(renders).toBe(1);
    });
});
