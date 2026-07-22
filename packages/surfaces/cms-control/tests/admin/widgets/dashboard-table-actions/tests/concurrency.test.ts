import { describe, expect, test } from "bun:test";
import { runDashboardWidgetAction } from "cms-control/components/admin/Resources/Dashboards/view/actions";
import { collectionActionDashboard, collectionActionGroup } from "../fixtures/collection";
import { deliveryGroup, nestedCreateDashboard } from "../fixtures/delivery";
import { emailerDashboard } from "../fixtures/emailer";
import { setupDashboardActionTests } from "../setup";
import { type RecordedDetailResource, resourceActionContext } from "../support";

setupDashboardActionTests();

describe("dashboard table actions", () => {
    test("abandons overlapping mutation resources and preserves both fallbacks", async () => {
        const responses: Array<(response: Response) => void> = [];
        globalThis.fetch = (() =>
            new Promise<Response>((resolve) => responses.push(resolve))) as unknown as typeof fetch;
        const resources: RecordedDetailResource[] = [];
        const reloaded: Array<{ collection: string; row: string }> = [];
        const context = resourceActionContext({
            detail: { collection: "emailerSettings", row: "default" },
            resources,
            reload(collection, row) {
                reloaded.push({ collection, row });
            },
        });
        const action = {
            action: "saveSettings",
            resource: { provider: "supabase", smtpHost: "smtp.old.test" },
            fields: { smtpHost: "smtp.saved.test" },
        };

        const first = runDashboardWidgetAction(context, action);
        const second = runDashboardWidgetAction(context, action);
        expect(responses).toHaveLength(2);

        responses[1]!(Response.json({ provider: "supabase", smtpHost: "smtp.second.test" }));
        await second;
        expect(resources).toEqual([]);
        expect(reloaded).toEqual([{ collection: "emailerSettings", row: "default" }]);

        responses[0]!(Response.json({ provider: "supabase", smtpHost: "smtp.first.test" }));
        await first;

        expect(resources).toEqual([]);
        expect(reloaded).toEqual([
            { collection: "emailerSettings", row: "default" },
            { collection: "emailerSettings", row: "default" },
        ]);
    });

    test("preserves every legacy fallback when mutations overlap", async () => {
        const responses: Array<(response: Response) => void> = [];
        globalThis.fetch = (() =>
            new Promise<Response>((resolve) => responses.push(resolve))) as unknown as typeof fetch;
        const reloaded: Array<{ collection: string; row: string }> = [];
        const context = resourceActionContext({
            dashboard: emailerDashboard(),
            detail: { collection: "emailerSettings", row: "default" },
            resources: [],
            reload(collection, row) {
                reloaded.push({ collection, row });
            },
        });
        const action = {
            action: "saveSettings",
            resource: { provider: "supabase", smtpHost: "smtp.old.test" },
            fields: { smtpHost: "smtp.saved.test" },
        };

        const first = runDashboardWidgetAction(context, action);
        const second = runDashboardWidgetAction(context, action);
        responses[1]!(Response.json({ provider: "supabase", smtpHost: "smtp.second.test" }));
        await second;
        expect(reloaded).toEqual([{ collection: "emailerSettings", row: "default" }]);

        responses[0]!(Response.json({ provider: "supabase", smtpHost: "smtp.first.test" }));
        await first;
        expect(reloaded).toEqual([
            { collection: "emailerSettings", row: "default" },
            { collection: "emailerSettings", row: "default" },
        ]);
    });

    test("keeps a successful fallback when an overlapping mutation fails", async () => {
        const responses: Array<(response: Response) => void> = [];
        globalThis.fetch = (() =>
            new Promise<Response>((resolve) => responses.push(resolve))) as unknown as typeof fetch;
        const reloaded: Array<{ collection: string; row: string }> = [];
        const context = resourceActionContext({
            detail: { collection: "emailerSettings", row: "default" },
            resources: [],
            reload(collection, row) {
                reloaded.push({ collection, row });
            },
        });
        const action = {
            action: "saveSettings",
            resource: { provider: "supabase", smtpHost: "smtp.old.test" },
            fields: { smtpHost: "smtp.saved.test" },
        };

        const successful = runDashboardWidgetAction(context, action);
        const failed = runDashboardWidgetAction(context, action);
        responses[0]!(Response.json({ provider: "supabase", smtpHost: "smtp.saved.test" }));
        await successful;
        expect(reloaded).toEqual([{ collection: "emailerSettings", row: "default" }]);

        responses[1]!(new Response("provider failed", { status: 502 }));
        await failed;
        expect(reloaded).toEqual([{ collection: "emailerSettings", row: "default" }]);
    });

    test("preserves distinct collection fallbacks when actions overlap", async () => {
        const responses: Array<(response: Response) => void> = [];
        globalThis.fetch = (() =>
            new Promise<Response>((resolve) => responses.push(resolve))) as unknown as typeof fetch;
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

        const first = runDashboardWidgetAction(context, { action: "createFirst", widget: "queueTable" });
        const second = runDashboardWidgetAction(context, { action: "createSecond", widget: "queueTable" });
        responses[1]!(Response.json({ id: "second-1" }, { status: 201 }));
        await second;
        responses[0]!(Response.json({ id: "first-1" }, { status: 201 }));
        await first;

        expect(resources).toEqual([]);
        expect(opened).toEqual([
            { collection: "secondDetail", row: "second-1" },
            { collection: "firstDetail", row: "first-1" },
        ]);
    });

    test("opens nested created resources when reuse is unsafe", async () => {
        const responses: Array<(response: Response) => void> = [];
        globalThis.fetch = (() =>
            new Promise<Response>((resolve) => responses.push(resolve))) as unknown as typeof fetch;
        const opened: Array<{ collection: string; row: string }> = [];
        const reloaded: Array<{ collection: string; row: string }> = [];
        const context = resourceActionContext({
            dashboard: nestedCreateDashboard(),
            group: deliveryGroup(),
            detail: { collection: "createShipmentForm", row: "__new__" },
            resources: [],
            reload: (collection, row) => reloaded.push({ collection, row }),
            openDetail: (collection, row) => opened.push({ collection, row }),
        });
        const action = { action: "createShipment", resource: {}, fields: { recipientName: "Ada" } };

        const first = runDashboardWidgetAction(context, action);
        const second = runDashboardWidgetAction(context, action);
        responses[1]!(Response.json({ item: { id: "shipment-2" } }, { status: 201 }));
        await second;
        responses[0]!(Response.json({ item: { id: "shipment-1" } }, { status: 201 }));
        await first;

        expect(reloaded).toEqual([]);
        expect(opened).toEqual([
            { collection: "createShipmentForm", row: "shipment-2" },
            { collection: "createShipmentForm", row: "shipment-1" },
        ]);
    });
});
