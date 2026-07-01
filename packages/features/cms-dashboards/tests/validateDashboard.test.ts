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
});
