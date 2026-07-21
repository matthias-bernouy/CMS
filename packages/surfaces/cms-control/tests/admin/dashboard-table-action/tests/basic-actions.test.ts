import { describe, expect, test } from "bun:test";
import { runDashboardWidgetAction } from "../../../../src/components/admin/Resources/Dashboards/DashboardViewActions";
import { executeDashboardTableAction } from "../../../../src/components/admin/Resources/Dashboards/runtime/actions";
import { deliveryDashboard, deliveryGroup } from "../fixtures/delivery";
import { dashboard, group, tableActionDashboard, tableActionGroup } from "../fixtures/newsletter";
import { setupDashboardActionTests } from "../setup";

setupDashboardActionTests();

describe("dashboard table actions", () => {
    test("downloads file responses from table endpoint actions", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return new Response("email,subscribed\nuser@example.com,true\n", {
                status: 200,
                headers: { "content-type": "text/csv; charset=utf-8" },
            });
        }) as typeof fetch;

        const result = await executeDashboardTableAction(
            group(),
            dashboard(),
            "exportSubscriptions",
            "subscriptionsTable",
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe("http://localhost:4999/.cms/sources/newsletter/exportSubscriptions");
        expect(requests[0]!.headers.get("accept")).toBe("*/*");
        expect(result.kind).toBe("download");
        if (result.kind === "download") {
            expect(result.filename).toBe("newsletter-subscriptions.csv");
            expect(await result.blob.text()).toBe("email,subscribed\nuser@example.com,true\n");
        }
    });

    test("opens the declared target after a detail action succeeds", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return new Response(JSON.stringify({ id: "shipment-1", ok: true }), {
                status: 201,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        const opened: Array<{ collection: string; row: string }> = [];

        await runDashboardWidgetAction(
            {
                group: deliveryGroup(),
                dashboard: deliveryDashboard(),
                detail: { collection: "createShipmentForm", row: "__new__" },
                drafts: new Map(),
                render() {
                    throw new Error("render should not run");
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

        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe("http://localhost:4999/.cms/sources/delivery/createShipment");
        expect(await requests[0]!.json()).toEqual({ recipientName: "Ada Lovelace" });
        expect(opened).toEqual([{ collection: "shipmentDetail", row: "shipment-1" }]);
    });

    test("keeps table widget actions routed as table actions", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        let renderCount = 0;

        await runDashboardWidgetAction(
            {
                group: tableActionGroup(),
                dashboard: tableActionDashboard(),
                detail: null,
                drafts: new Map(),
                render() {
                    renderCount++;
                },
                reload() {
                    throw new Error("reload should not run");
                },
                clearDetail() {
                    throw new Error("clearDetail should not run");
                },
                openDetail() {
                    throw new Error("openDetail should not run");
                },
            },
            {
                action: "clearQueue",
                widget: "queueTable",
            },
        );

        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe("http://localhost:4999/.cms/sources/newsletter/clearQueue");
        expect(renderCount).toBe(1);
    });
});
