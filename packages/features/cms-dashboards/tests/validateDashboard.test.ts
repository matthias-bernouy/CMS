import { describe, expect, test } from "bun:test";
import type { Source } from "@bernouy/cms-sources";
import { validateDashboard, type Dashboard } from "@bernouy/cms-dashboards";

const source: Source = {
    urn: "urn:commerce",
    endpoints: [
        {
            urn: "urn:commerce:listOrders",
            method: "GET",
            targetUrl: "https://example.com/orders",
            input: {
                params: [
                    { name: "status", in: "query", schema: { type: "string" } },
                ],
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            items: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        id: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        },
        {
            urn: "urn:commerce:getOrder",
            method: "GET",
            targetUrl: "https://example.com/orders/{orderId}",
            input: {
                params: [
                    { name: "orderId", in: "path", required: true, schema: { type: "string" } },
                ],
            },
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            id: { type: "string" },
                            status: { type: "string" },
                        },
                    },
                },
            ],
        },
        {
            urn: "urn:commerce:refundOrder",
            method: "DELETE",
            targetUrl: "https://example.com/orders/{orderId}",
            input: {
                params: [
                    { name: "orderId", in: "path", required: true, schema: { type: "string" } },
                ],
            },
        },
        {
            urn: "urn:commerce:updateOrder",
            method: "PUT",
            targetUrl: "https://example.com/orders/{orderId}",
            input: {
                params: [
                    { name: "orderId", in: "path", required: true, schema: { type: "string" } },
                ],
                body: {
                    type: "object",
                    properties: {
                        status: { type: "string" },
                    },
                },
            },
        },
        {
            urn: "urn:commerce:patchOrder",
            method: "PATCH",
            targetUrl: "https://example.com/orders/{orderId}",
            input: {
                params: [
                    { name: "orderId", in: "path", required: true, schema: { type: "string" } },
                ],
                body: {
                    type: "object",
                    properties: {
                        status: { type: "string" },
                    },
                },
            },
        },
        {
            urn: "urn:commerce:createOrder",
            method: "POST",
            targetUrl: "https://example.com/orders",
            input: {
                params: [
                    { name: "userId", in: "query", required: true, schema: { type: "string" } },
                ],
                body: {
                    type: "object",
                    properties: {
                        amount: { type: "number" },
                    },
                },
            },
        },
        {
            urn: "urn:commerce:orderStats",
            method: "GET",
            targetUrl: "https://example.com/orders/stats",
        },
    ],
};

const validDashboard = (): Dashboard => ({
    id: "commerce",
    source: "commerce",
    collections: [
        {
            id: "orders",
            rowKey: "id",
            list: { endpoint: "listOrders", params: { status: "$param.status" }, itemsPath: "items" },
            item: {
                delete: { endpoint: "refundOrder", params: { orderId: "$row.id" } },
            },
        },
    ],
    views: [
        {
            widget: "w-table",
            collection: "orders",
            rowActions: [
                { widget: "w-table-row-action", label: "Refund", action: "delete" },
            ],
        },
        { widget: "w-stat", endpoint: "orderStats", path: "count" },
    ],
});

describe("validateDashboard", () => {
    test("accepts a valid dashboard against its source", () => {
        expect(validateDashboard(validDashboard(), { source })).toEqual([]);
    });

    test("accepts item detail widgets backed by selection params", () => {
        const dashboard = validDashboard();
        dashboard.collections[0]!.item = {
            ...dashboard.collections[0]!.item,
            get: { endpoint: "getOrder", params: { orderId: "$selection" } },
        };
        dashboard.views.push({ widget: "w-detail", collection: "orders", fields: ["id", "status"] });

        expect(validateDashboard(dashboard, { source })).toEqual([]);
    });

    test("rejects item detail widgets without an item get endpoint", () => {
        const dashboard = validDashboard();
        dashboard.views.push({ widget: "w-detail", collection: "orders", fields: ["id"] });

        expect(validateDashboard(dashboard, { source })).toContain(
            'views.2.collection "orders" must declare item.get for w-detail',
        );
    });

    test("rejects item detail widgets without a selectable row binding", () => {
        const dashboard = validDashboard();
        delete dashboard.collections[0]!.rowKey;
        dashboard.collections[0]!.item = {
            ...dashboard.collections[0]!.item,
            get: { endpoint: "getOrder", params: { orderId: "$param.status" } },
        };
        dashboard.views.push({ widget: "w-detail", collection: "orders", fields: ["id"] });

        expect(validateDashboard(dashboard, { source })).toEqual(expect.arrayContaining([
            'views.2.collection "orders" must declare rowKey for w-detail',
            'views.2.collection "orders" item.get must bind a param to $selection',
        ]));
    });

    test("rejects selection params outside item detail endpoints", () => {
        const dashboard = validDashboard();
        dashboard.collections[0]!.list.params = { status: "$selection" };

        expect(validateDashboard(dashboard, { source })).toContain(
            "collections.orders.list.params.status uses $selection outside a selectable collection item endpoint",
        );
    });

    test("accepts create widgets backed by item create endpoints", () => {
        const dashboard = validDashboard();
        dashboard.collections[0]!.item = {
            ...dashboard.collections[0]!.item,
            create: { endpoint: "createOrder", params: { userId: "$param.userId" } },
        };
        dashboard.views.push({
            widget: "w-create",
            collection: "orders",
            fields: [
                { field: "userId", input: "cms-user", required: true },
                { field: "amount", input: "number", required: true },
            ],
        });

        expect(validateDashboard(dashboard, { source })).toEqual([]);
    });

    test("rejects create widgets without an item create endpoint", () => {
        const dashboard = validDashboard();
        dashboard.views.push({ widget: "w-create", collection: "orders", fields: ["amount"] });

        expect(validateDashboard(dashboard, { source })).toContain(
            'views.2.collection "orders" must declare item.create for w-create',
        );
    });

    test("accepts update widgets backed by selected item update endpoints", () => {
        const dashboard = validDashboard();
        dashboard.collections[0]!.item = {
            ...dashboard.collections[0]!.item,
            get: { endpoint: "getOrder", params: { orderId: "$selection" } },
            update: { endpoint: "updateOrder", params: { orderId: "$selection" } },
        };
        dashboard.views.push({
            widget: "w-update",
            collection: "orders",
            label: "Edit order",
            submitLabel: "Save order",
            fields: [{ field: "status", required: true }],
        });

        expect(validateDashboard(dashboard, { source })).toEqual([]);
    });

    test("accepts update widgets backed by selected item patch endpoints", () => {
        const dashboard = validDashboard();
        dashboard.collections[0]!.item = {
            ...dashboard.collections[0]!.item,
            get: { endpoint: "getOrder", params: { orderId: "$selection" } },
            patch: { endpoint: "patchOrder", params: { orderId: "$selection" } },
        };
        dashboard.views.push({
            widget: "w-update",
            action: "patch",
            collection: "orders",
            fields: ["status"],
        });

        expect(validateDashboard(dashboard, { source })).toEqual([]);
    });

    test("rejects update widgets without selected item endpoints", () => {
        const dashboard = validDashboard();
        dashboard.views.push({ widget: "w-update", collection: "orders", fields: ["status"] });

        expect(validateDashboard(dashboard, { source })).toEqual(expect.arrayContaining([
            'views.2.collection "orders" must declare item.get for w-update',
            'views.2.collection "orders" must declare item.update for w-update',
        ]));
    });

    test("rejects update widgets whose write endpoint is not bound to the selected row", () => {
        const dashboard = validDashboard();
        dashboard.collections[0]!.item = {
            ...dashboard.collections[0]!.item,
            get: { endpoint: "getOrder", params: { orderId: "$selection" } },
            update: { endpoint: "updateOrder", params: { orderId: "$param.status" } },
        };
        dashboard.views.push({ widget: "w-update", collection: "orders", fields: ["status"] });

        expect(validateDashboard(dashboard, { source })).toContain(
            'views.2.collection "orders" item.update must bind a param to $selection',
        );
    });

    test("rejects dangling collections and row actions", () => {
        const dashboard = validDashboard();
        dashboard.views = [
            { widget: "w-table", collection: "missing", rowActions: [{ widget: "w-table-row-action", label: "Refund", action: "patch" }] },
        ];

        expect(validateDashboard(dashboard, { source })).toContain('views.0.collection references unknown collection "missing"');
    });

    test("rejects unknown endpoints and missing required params", () => {
        const dashboard = validDashboard();
        dashboard.collections[0]!.item = {
            delete: { endpoint: "refundOrder" },
            patch: { endpoint: "missingEndpoint" },
        };

        expect(validateDashboard(dashboard, { source })).toEqual(expect.arrayContaining([
            'collections.orders.item.delete.params.orderId is required by endpoint "urn:commerce:refundOrder"',
            'collections.orders.item.patch.endpoint references unknown endpoint "missingEndpoint"',
        ]));
    });

    test("rejects bindings for params not declared by the endpoint", () => {
        const dashboard = validDashboard();
        dashboard.collections[0]!.list.params = { unexpected: "$param.status" };

        expect(validateDashboard(dashboard, { source })).toContain(
            "collections.orders.list.params.unexpected does not match a declared endpoint param",
        );
    });

    test("rejects unsafe field paths", () => {
        const dashboard = validDashboard();
        dashboard.views = [{ widget: "w-stat", endpoint: "orderStats", path: "count }}<script>" }];

        expect(validateDashboard(dashboard, { source })).toContain(
            "views.0.path must be a dotted field path",
        );
    });
});
