import { describe, expect, test } from "bun:test";
import { runDashboardWidgetAction } from "cms-control/components/admin/Resources/Dashboards/view/actions";
import { executeDashboardTableAction } from "cms-control/components/admin/Resources/Dashboards/runtime/actions";
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

    test("passes the active table filters to endpoint actions", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            requests.push(new Request(input, init));
            return new Response("email,subscribed\n", {
                status: 200,
                headers: { "content-type": "text/csv; charset=utf-8" },
            });
        }) as typeof fetch;
        const sourceGroup = group();

        await executeDashboardTableAction(
            sourceGroup,
            dashboard(),
            "exportSubscriptions",
            "subscriptionsTable",
            undefined,
            [sourceGroup],
            { q: "ada", subscribed: "true" },
        );

        expect(requests).toHaveLength(1);
        expect(new URL(requests[0]!.url).searchParams.toString()).toBe("q=ada&subscribed=true");
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

    test("routes collection actions with the active detail selection", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return Response.json({ ref: "question-2" });
        }) as typeof fetch;
        const activeDashboard = tableActionDashboard();
        activeDashboard.views = [
            {
                widget: "w-detail",
                id: "queueDetail",
                source: { endpoint: "queueItem" },
                main: [
                    {
                        widget: "w-navigation-list",
                        id: "queueNavigation",
                        source: { endpoint: "listQueue", itemsPath: "items" },
                        rowKey: "id",
                        item: { title: { path: "id" } },
                        actions: [
                            {
                                id: "clearQueue",
                                label: "Clear queue",
                                endpoint: {
                                    endpoint: "clearQueue",
                                    body: { context: "$selection.queueDetail.id" },
                                },
                            },
                        ],
                    },
                ],
            },
        ];

        await runDashboardWidgetAction(
            {
                group: tableActionGroup(),
                dashboard: activeDashboard,
                detail: { collection: "queueDetail", row: "queue-1" },
                drafts: new Map(),
                render() {},
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
            { action: "clearQueue", widget: "queueNavigation" },
        );

        expect(requests).toHaveLength(1);
        expect(await requests[0]!.json()).toEqual({ context: "queue-1" });
    });
});
