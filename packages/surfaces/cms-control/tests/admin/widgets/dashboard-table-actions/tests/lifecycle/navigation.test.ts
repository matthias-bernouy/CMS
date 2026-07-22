import { describe, expect, test } from "bun:test";
import { runDashboardWidgetAction } from "cms-control/components/admin/Resources/Dashboards/view/actions";
import { DetailResourceState } from "cms-control/components/admin/Resources/Dashboards/domain";
import { withActionResource } from "../../dashboard";
import { deliveryDashboard, schemaInvalidatingDeliveryGroup } from "../../fixtures/delivery";
import { emailerDashboard, schemaInvalidatingEmailerGroup } from "../../fixtures/emailer";
import { setupDashboardActionTests } from "../../setup";
import { deferred, type RecordedDetailResource, resourceActionContext } from "../../support";

setupDashboardActionTests();

describe("dashboard table actions", () => {
    test("does not reopen a stale detail after navigation during a schema reload", async () => {
        globalThis.fetch = (async () =>
            Response.json({ provider: "supabase", smtpHost: "smtp.saved.test" })) as unknown as typeof fetch;
        const definitionsStarted = deferred<void>();
        const definitionsRelease = deferred<void>();
        const resources: RecordedDetailResource[] = [];
        const reloaded: Array<{ collection: string; row: string }> = [];
        const actionCoordinator = new DetailResourceState();
        let renders = 0;
        const context = resourceActionContext({
            dashboard: withActionResource(emailerDashboard(), "emailerSettings", "saveSettings", "$result"),
            group: schemaInvalidatingEmailerGroup(),
            detail: { collection: "emailerSettings", row: "default" },
            resources,
            actionCoordinator,
            render: () => {
                renders += 1;
            },
            async reloadDefinitions() {
                definitionsStarted.resolve();
                await definitionsRelease.promise;
            },
            reload(collection, row) {
                reloaded.push({ collection, row });
            },
        });

        const pending = runDashboardWidgetAction(context, {
            action: "saveSettings",
            resource: { provider: "supabase", smtpHost: "smtp.old.test" },
            fields: { smtpHost: "smtp.saved.test" },
        });
        await definitionsStarted.promise;
        actionCoordinator.clear();
        definitionsRelease.resolve();
        await pending;

        expect(resources).toEqual([]);
        expect(reloaded).toEqual([]);
        expect(renders).toBe(1);
    });

    test("reloads CMS definitions after an endpoint invalidates the schema", async () => {
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ id: "shipment-1" }), {
                status: 201,
                headers: { "content-type": "application/json" },
            })) as unknown as typeof fetch;
        let reloadDefinitions = 0;
        const opened: Array<{ collection: string; row: string }> = [];

        await runDashboardWidgetAction(
            {
                group: schemaInvalidatingDeliveryGroup(),
                dashboard: deliveryDashboard(),
                detail: { collection: "createShipmentForm", row: "__new__" },
                drafts: new Map(),
                render() {
                    throw new Error("render should not run");
                },
                async reloadDefinitions() {
                    reloadDefinitions++;
                },
                reload() {
                    throw new Error("reload should not run");
                },
                clearDetail() {
                    throw new Error("clearDetail should not run");
                },
                openDetail(collection, row) {
                    opened.push({ collection, row });
                },
            },
            {
                action: "createShipment",
                resource: { modeCollection: "CCC" },
                fields: { recipientName: "Ada Lovelace" },
            },
        );

        expect(reloadDefinitions).toBe(1);
        expect(opened).toEqual([{ collection: "shipmentDetail", row: "shipment-1" }]);
    });
});
