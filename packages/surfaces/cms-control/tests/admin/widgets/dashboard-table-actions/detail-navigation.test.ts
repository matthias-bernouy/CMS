import { afterEach, describe, expect, test } from "bun:test";
import { runDashboardWidgetAction } from "../../../../src/components/admin/Resources/Dashboards/view/DashboardViewActions";
import { deliveryDashboard, deliveryGroup, schemaInvalidatingDeliveryGroup } from "./detailFixtures";
import { resetDashboardActionTest } from "./testSetup";

afterEach(resetDashboardActionTest);

describe("dashboard table actions", () => {
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

    test("reloads CMS definitions after an endpoint invalidates the schema", async () => {
        globalThis.fetch = (async () =>
            new Response(JSON.stringify({ id: "shipment-1" }), {
                status: 201,
                headers: { "content-type": "application/json" },
            })) as unknown as typeof fetch;
        let reloadDefinitions = 0;

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
                openDetail() {},
            },
            {
                action: "createShipment",
                resource: { modeCollection: "CCC" },
                fields: { recipientName: "Ada Lovelace" },
            },
        );

        expect(reloadDefinitions).toBe(1);
    });
});
