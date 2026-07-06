import { afterEach, describe, expect, test } from "bun:test";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../../src/components/admin/Resources/Dashboards/types";
import { runDashboardWidgetAction } from "../../src/components/admin/Resources/Dashboards/DashboardViewActions";
import { executeDashboardTableAction } from "../../src/components/admin/Resources/Dashboards/runtime/actions";

const realFetch = globalThis.fetch;

if (!customElements.get("p9r-toast-stack")) {
    customElements.define("p9r-toast-stack", class extends HTMLElement {
        push(message: string): HTMLElement {
            const toast = document.createElement("p9r-toast");
            toast.textContent = message;
            this.append(toast);
            return toast;
        }
    });
}

afterEach(() => {
    globalThis.fetch = realFetch;
    document.head.innerHTML = "";
    document.body.replaceChildren();
});

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

        const result = await executeDashboardTableAction(group(), dashboard(), "exportSubscriptions", "subscriptionsTable");

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

        await runDashboardWidgetAction({
            group: deliveryGroup(),
            dashboard: deliveryDashboard(),
            detail: { collection: "createShipmentForm", row: "__new__" },
            drafts: new Map(),
            render() { throw new Error("render should not run"); },
            reload() { throw new Error("reload should not run"); },
            clearDetail() { throw new Error("clearDetail should not run"); },
            openDetail(collection, row) { opened.push({ collection, row }); },
        }, {
            action: "createShipment",
            resource: { modeCollection: "CCC" },
            fields: { recipientName: "Ada Lovelace" },
        });

        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe("http://localhost:4999/.cms/sources/delivery/createShipment");
        expect(await requests[0]!.json()).toEqual({ recipientName: "Ada Lovelace" });
        expect(opened).toEqual([{ collection: "shipmentDetail", row: "shipment-1" }]);
    });
});

function group(): DashboardSourceGroup {
    return {
        source: {
            urn: "urn:newsletter",
            id: "newsletter",
            name: "Newsletter",
            endpointCount: 1,
            dashboardCount: 1,
            readonly: false,
        },
        endpoints: [
            {
                endpointId: "exportSubscriptions",
                method: "GET",
                targetUrl: "https://project.supabase.co/functions/v1/cms-newsletter/subscriptions/export",
                responseKind: "file",
                mediaType: "text/csv",
                params: [],
            },
        ],
        dashboards: [],
    };
}

function dashboard(): DashboardDto {
    return {
        id: "newsletter-subscriptions",
        source: "newsletter",
        views: [
            {
                widget: "w-table",
                id: "subscriptionsTable",
                source: { endpoint: "listSubscriptions", itemsPath: "subscriptions" },
                rowKey: "email",
                columns: [{ id: "email", label: "Email", path: "email", primary: true }],
                actions: [
                    {
                        id: "exportSubscriptions",
                        label: "Export CSV",
                        endpoint: { endpoint: "exportSubscriptions" },
                        download: { filename: "newsletter-subscriptions.csv" },
                    },
                ],
            },
        ],
    };
}

function deliveryGroup(): DashboardSourceGroup {
    return {
        source: {
            urn: "urn:delivery",
            id: "delivery",
            name: "Delivery",
            endpointCount: 1,
            dashboardCount: 1,
            readonly: false,
        },
        endpoints: [
            {
                endpointId: "createShipment",
                method: "POST",
                targetUrl: "https://project.supabase.co/functions/v1/cms-delivery/shipments",
                params: [],
            },
        ],
        dashboards: [],
    };
}

function deliveryDashboard(): DashboardDto {
    return {
        id: "delivery-delivery",
        source: "delivery",
        views: [
            {
                widget: "w-detail",
                id: "createShipmentForm",
                source: { endpoint: "setting", params: { id: "default" } },
                title: { path: "externalOrderId", fallback: "Create shipment" },
                actions: [
                    {
                        id: "createShipment",
                        label: "Create shipment",
                        endpoint: {
                            endpoint: "createShipment",
                            body: { recipientName: "$field.recipientName" },
                        },
                        after: { opens: "shipmentDetail", row: "$result.id" },
                    },
                ],
                main: [
                    {
                        id: "recipient",
                        title: "Recipient",
                        fields: [
                            { id: "recipientName", label: "Recipient", path: "recipientName", type: "text" },
                        ],
                    },
                ],
            },
            {
                widget: "w-detail",
                id: "shipmentDetail",
                source: { endpoint: "shipment", params: { id: "$selection.id" } },
                title: { path: "expeditionNumber", fallback: "Shipment" },
                main: [
                    {
                        id: "shipmentGeneral",
                        title: "Shipment",
                        fields: [
                            { id: "expeditionNumber", label: "Expedition", path: "expeditionNumber", type: "readonly" },
                        ],
                    },
                ],
            },
        ],
    };
}
