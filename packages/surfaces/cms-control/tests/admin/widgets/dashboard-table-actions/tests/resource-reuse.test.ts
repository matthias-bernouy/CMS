import { describe, expect, test } from "bun:test";
import { runDashboardWidgetAction } from "cms-control/components/admin/Resources/Dashboards/view/actions";
import { withActionResource } from "../dashboard";
import { collectionActionDashboard, collectionActionGroup } from "../fixtures/collection";
import { deliveryDashboard, deliveryGroup } from "../fixtures/delivery";
import { emailerDashboard } from "../fixtures/emailer";
import { setupDashboardActionTests } from "../setup";
import { type RecordedDetailResource, resourceActionContext } from "../support";

setupDashboardActionTests();

describe("dashboard table actions", () => {
    test("reuses a selected detail mutation result without reloading its source", async () => {
        const updated = {
            provider: "supabase",
            smtpHost: "smtp.saved.test",
            smtpPassword: null,
        };
        globalThis.fetch = (async () => Response.json(updated)) as unknown as typeof fetch;
        const resources: RecordedDetailResource[] = [];
        let renders = 0;
        const context = resourceActionContext({
            detail: { collection: "emailerSettings", row: "default" },
            resources,
            render: () => {
                renders += 1;
            },
            reload() {
                throw new Error("reload should not run");
            },
        });

        await runDashboardWidgetAction(context, {
            action: "saveSettings",
            resource: { provider: "supabase", smtpHost: "smtp.old.test" },
            fields: { smtpHost: "smtp.saved.test" },
        });

        expect(resources).toEqual([{ collection: "emailerSettings", row: "default", resource: updated }]);
        expect(renders).toBe(1);
    });

    test("reuses a root detail mutation result without selecting or reloading it", async () => {
        const updated = { provider: "supabase", smtpHost: "smtp.saved.test" };
        globalThis.fetch = (async () => Response.json(updated)) as unknown as typeof fetch;
        const resources: RecordedDetailResource[] = [];
        let renders = 0;
        const context = resourceActionContext({
            detail: null,
            resources,
            render: () => {
                renders += 1;
            },
            reload() {
                throw new Error("reload should not run");
            },
        });

        await runDashboardWidgetAction(context, {
            action: "saveSettings",
            detail: true,
            widget: "emailerSettings",
            row: "",
            resource: { provider: "supabase", smtpHost: "smtp.old.test" },
            fields: { smtpHost: "smtp.saved.test" },
        });

        expect(resources).toEqual([{ collection: "emailerSettings", row: "", resource: updated }]);
        expect(renders).toBe(1);
    });

    test("resolves a nested post-action resource from the mutation result", async () => {
        const item = { provider: "supabase", smtpHost: "smtp.saved.test", updatedAt: null };
        globalThis.fetch = (async () => Response.json({ item })) as unknown as typeof fetch;
        const resources: RecordedDetailResource[] = [];
        const context = resourceActionContext({
            dashboard: withActionResource(emailerDashboard(), "emailerSettings", "saveSettings", "$result.item"),
            detail: { collection: "emailerSettings", row: "default" },
            resources,
            reload() {
                throw new Error("reload should not run");
            },
        });

        await runDashboardWidgetAction(context, {
            action: "saveSettings",
            resource: { provider: "supabase", smtpHost: "smtp.old.test" },
            fields: { smtpHost: "smtp.saved.test" },
        });

        expect(resources).toEqual([{ collection: "emailerSettings", row: "default", resource: item }]);
    });

    test("stores a created resource under the final post-action target", async () => {
        const created = { id: "shipment-1", expeditionNumber: null, status: "draft" };
        globalThis.fetch = (async () => Response.json(created, { status: 201 })) as unknown as typeof fetch;
        const resources: RecordedDetailResource[] = [];
        const opened: Array<{ collection: string; row: string }> = [];
        const context = resourceActionContext({
            dashboard: withActionResource(deliveryDashboard(), "createShipmentForm", "createShipment", "$result"),
            group: deliveryGroup(),
            detail: { collection: "createShipmentForm", row: "__new__" },
            resources,
            render() {
                throw new Error("render should not run");
            },
            reload() {
                throw new Error("reload should not run");
            },
            openDetail(collection, row) {
                opened.push({ collection, row });
            },
        });

        await runDashboardWidgetAction(context, {
            action: "createShipment",
            resource: { modeCollection: "CCC" },
            fields: { recipientName: "Ada Lovelace" },
        });

        expect(resources).toEqual([{ collection: "shipmentDetail", row: "shipment-1", resource: created }]);
        expect(opened).toEqual([{ collection: "shipmentDetail", row: "shipment-1" }]);
    });

    test("reloads when the declared post-action resource path is absent", async () => {
        globalThis.fetch = (async () => Response.json({ ok: true })) as unknown as typeof fetch;
        const resources: RecordedDetailResource[] = [];
        const reloaded: Array<{ collection: string; row: string }> = [];
        const context = resourceActionContext({
            dashboard: withActionResource(emailerDashboard(), "emailerSettings", "saveSettings", "$result.item"),
            detail: { collection: "emailerSettings", row: "default" },
            resources,
            reload(collection, row) {
                reloaded.push({ collection, row });
            },
        });

        await runDashboardWidgetAction(context, {
            action: "saveSettings",
            resource: { provider: "supabase", smtpHost: "smtp.old.test" },
            fields: { smtpHost: "smtp.saved.test" },
        });

        expect(resources).toEqual([]);
        expect(reloaded).toEqual([{ collection: "emailerSettings", row: "default" }]);
    });

    test("reuses an isolated collection mutation result for its opened detail", async () => {
        const created = { id: "first-1", status: "ready" };
        globalThis.fetch = (async () => Response.json(created, { status: 201 })) as unknown as typeof fetch;
        const resources: RecordedDetailResource[] = [];
        const opened: Array<{ collection: string; row: string }> = [];
        const context = resourceActionContext({
            dashboard: collectionActionDashboard(),
            group: collectionActionGroup(),
            detail: null,
            resources,
            reload() {
                throw new Error("reload should not run");
            },
            openDetail(collection, row) {
                opened.push({ collection, row });
            },
        });

        await runDashboardWidgetAction(context, { action: "createFirst", widget: "queueTable" });

        expect(resources).toEqual([{ collection: "firstDetail", row: "first-1", resource: created }]);
        expect(opened).toEqual([{ collection: "firstDetail", row: "first-1" }]);
    });
});
