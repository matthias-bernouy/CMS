import { afterEach, describe, expect, test } from "bun:test";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../../src/components/admin/Resources/Dashboards/types";
import { runDashboardWidgetAction } from "../../src/components/admin/Resources/Dashboards/DashboardViewActions";
import { executeDashboardAction, executeDashboardTableAction } from "../../src/components/admin/Resources/Dashboards/runtime/actions";

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

        await runDashboardWidgetAction({
            group: tableActionGroup(),
            dashboard: tableActionDashboard(),
            detail: null,
            drafts: new Map(),
            render() { renderCount++; },
            reload() { throw new Error("reload should not run"); },
            clearDetail() { throw new Error("clearDetail should not run"); },
            openDetail() { throw new Error("openDetail should not run"); },
        }, {
            action: "clearQueue",
            widget: "queueTable",
        });

        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe("http://localhost:4999/.cms/sources/newsletter/clearQueue");
        expect(renderCount).toBe(1);
    });

    test("runs detail widget actions rendered without a selected row", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return new Response(JSON.stringify({ smtpHost: "smtp.saved.test" }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        }) as typeof fetch;
        let renderCount = 0;

        await runDashboardWidgetAction({
            group: emailerGroup(),
            dashboard: emailerDashboard(),
            detail: null,
            drafts: new Map(),
            render() { renderCount++; },
            reload() { throw new Error("reload should not run"); },
            clearDetail() { throw new Error("clearDetail should not run"); },
            openDetail() { throw new Error("openDetail should not run"); },
        }, {
            action: "saveSettings",
            detail: true,
            widget: "emailerSettings",
            row: "",
            resource: { provider: "supabase", smtpHost: "smtp.old.test" },
            fields: { smtpHost: "smtp.saved.test" },
        });

        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe("http://localhost:4999/.cms/sources/emailer/updateSettings");
        expect(await requests[0]!.json()).toEqual({ smtpHost: "smtp.saved.test" });
        expect(renderCount).toBe(1);
    });

    test("reloads CMS definitions after an endpoint invalidates the schema", async () => {
        globalThis.fetch = (async () => new Response(JSON.stringify({ id: "shipment-1" }), {
            status: 201,
            headers: { "content-type": "application/json" },
        })) as unknown as typeof fetch;
        let reloadDefinitions = 0;

        await runDashboardWidgetAction({
            group: schemaInvalidatingDeliveryGroup(),
            dashboard: deliveryDashboard(),
            detail: { collection: "createShipmentForm", row: "__new__" },
            drafts: new Map(),
            render() { throw new Error("render should not run"); },
            async reloadDefinitions() { reloadDefinitions++; },
            reload() { throw new Error("reload should not run"); },
            clearDetail() { throw new Error("clearDetail should not run"); },
            openDetail() {},
        }, {
            action: "createShipment",
            resource: { modeCollection: "CCC" },
            fields: { recipientName: "Ada Lovelace" },
        });

        expect(reloadDefinitions).toBe(1);
    });

    test("uses the declared method for a cross-source action", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return Response.json({ status: "staged" });
        }) as typeof fetch;
        const commerce = tableActionGroup();
        const stripe: DashboardSourceGroup = {
            source: { urn: "urn:stripe-connect", id: "stripe-connect", name: "Stripe", endpointCount: 1, dashboardCount: 0, readonly: false },
            endpoints: [{ endpointId: "stageStripeDisputeEvidence", method: "POST", targetUrl: "https://stripe.test/disputes/evidence", params: [] }],
            dashboards: [],
        };
        const composed: DashboardDto = {
            id: "payments-disputes",
            source: "newsletter",
            views: [{
                widget: "w-detail",
                id: "disputeDetail",
                source: { sourceId: "stripe-connect", endpoint: "getStripeDispute" },
                actions: [{
                    id: "stageEvidence",
                    label: "Stage evidence",
                    endpoint: {
                        sourceId: "stripe-connect",
                        endpoint: "stageStripeDisputeEvidence",
                        body: { disputeId: "$resource.id" },
                    },
                }],
                main: [{ id: "state", title: "State", fields: [] }],
            }],
        };

        await executeDashboardAction(
            commerce,
            composed,
            { collection: "disputeDetail", row: "dp_123" },
            "stageEvidence",
            {},
            { id: "dp_123" },
            [commerce, stripe],
        );

        expect(requests[0]?.method).toBe("POST");
        expect(requests[0]?.url).toBe("http://localhost:4999/.cms/sources/stripe-connect/stageStripeDisputeEvidence");
        expect(await requests[0]?.json()).toEqual({ disputeId: "dp_123" });
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

function schemaInvalidatingDeliveryGroup(): DashboardSourceGroup {
    const group = deliveryGroup();
    group.endpoints[0]!.effects = { invalidatesSchema: true };
    return group;
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

function emailerGroup(): DashboardSourceGroup {
    return {
        source: {
            urn: "urn:emailer",
            id: "emailer",
            name: "Emailer",
            endpointCount: 1,
            dashboardCount: 1,
            readonly: false,
        },
        endpoints: [
            {
                endpointId: "updateSettings",
                method: "POST",
                targetUrl: "https://project.supabase.co/functions/v1/cms-emailer/settings",
                params: [],
            },
        ],
        dashboards: [],
    };
}

function emailerDashboard(): DashboardDto {
    return {
        id: "emailer-settings",
        source: "emailer",
        views: [
            {
                widget: "w-detail",
                id: "emailerSettings",
                source: { endpoint: "getSettings" },
                title: { path: "provider", fallback: "Settings" },
                actions: [
                    {
                        id: "saveSettings",
                        label: "Save settings",
                        endpoint: {
                            endpoint: "updateSettings",
                            body: { smtpHost: "$field.smtpHost" },
                        },
                    },
                ],
                main: [
                    {
                        id: "provider",
                        title: "Provider",
                        fields: [
                            { id: "smtpHost", label: "SMTP host", path: "smtpHost", type: "text" },
                        ],
                    },
                ],
            },
        ],
    };
}

function tableActionGroup(): DashboardSourceGroup {
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
                endpointId: "clearQueue",
                method: "POST",
                targetUrl: "https://project.supabase.co/functions/v1/cms-newsletter/queue/clear",
                params: [],
            },
        ],
        dashboards: [],
    };
}

function tableActionDashboard(): DashboardDto {
    return {
        id: "newsletter-queue",
        source: "newsletter",
        views: [
            {
                widget: "w-table",
                id: "queueTable",
                source: { endpoint: "listQueue", itemsPath: "items" },
                rowKey: "id",
                columns: [{ id: "id", label: "ID", path: "id", primary: true }],
                actions: [{
                    id: "clearQueue",
                    label: "Clear queue",
                    endpoint: { endpoint: "clearQueue" },
                }],
            },
        ],
    };
}
