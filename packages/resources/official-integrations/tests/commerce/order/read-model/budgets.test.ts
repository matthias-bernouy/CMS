import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { buyerId, sellerUserId } from "./fixtures/raw";
import { useCompleteOrderResponder } from "./fixtures/responder";

installCommerceTestEnvironment();

describe("commerce current PostgREST read budgets", () => {
    test("records list budgets independently from response contracts", async () => {
        useCompleteOrderResponder();

        await expectBudget("/me/orders?limit=2&offset=2", { userId: buyerId }, {
            list_order_read_model: 1,
        });
        await expectBudget("/me/sales?limit=2&offset=2", { userId: sellerUserId }, {
            list_order_read_model: 1,
        });
        await expectBudget("/admin/orders?limit=2&offset=2", {}, {
            list_order_read_model: 1,
        });
    });

    test("records detail budgets independently from response contracts", async () => {
        useCompleteOrderResponder();

        await expectBudget("/me/order?id=42", { userId: buyerId }, {
            orders: 1, order_lines: 1, order_events: 1, sellers: 1,
            protected_order_operations: 1, order_financial_terms: 1, order_fulfillments: 1,
            order_settlements: 1, marketplace_claims: 1, custom_field_definitions: 1,
        });
        await expectBudget("/me/sale?id=42", { userId: sellerUserId }, {
            sellers: 1, orders: 1, order_lines: 1, order_events: 1,
            protected_order_operations: 1, order_financial_terms: 1, order_fulfillments: 1,
            order_settlements: 1, get_order_fulfillment_authorization: 1,
            custom_field_definitions: 1,
        });
        await expectBudget("/admin/order?id=42", {}, {
            orders: 1, order_lines: 1, order_events: 1, sellers: 1,
            protected_order_operations: 1, order_financial_terms: 1,
            order_fulfillments: 1, order_settlements: 1, marketplace_claims: 1,
        });
    });

    test("records empty, missing-actor-profile, and not-found short circuits", async () => {
        setRestResponder(async request => {
            const url = new URL(request.url);
            const resource = url.pathname.split("/").at(-1);
            if (resource === "list_order_read_model") {
                const body = await request.json() as Record<string, unknown>;
                if (body.p_scope === "seller" && body.p_cms_user_id === "missing-seller") {
                    return jsonResponse({
                        state: "seller_missing", orders: [], operations: [], definitions: [], total: 0,
                    });
                }
                return jsonResponse({
                    state: "ok", orders: [], operations: [], definitions: [], total: 4,
                });
            }
            if (resource === "sellers") {
                return jsonResponse(url.searchParams.get("cms_user_id") === "eq.missing-seller"
                    ? []
                    : [{ id: 17 }]);
            }
            if (resource === "orders") {
                return jsonResponse([], 200, { "content-range": "*/4" });
            }
            if (resource === "custom_field_definitions") return jsonResponse([]);
            throw new Error(`Unexpected empty-budget request: ${request.url}`);
        });

        await expectBudget("/me/orders?limit=2&offset=8", { userId: buyerId }, {
            list_order_read_model: 1,
        }, { items: [], total: 4, limit: 2, offset: 8 });
        await expectBudget("/me/sales?limit=7&offset=3", { userId: "missing-seller" }, {
            list_order_read_model: 1,
        }, { items: [], total: 0, limit: 7, offset: 3 });
        await expectBudget("/me/sales?limit=7&offset=3", { userId: sellerUserId }, {
            list_order_read_model: 1,
        }, { items: [], total: 4, limit: 7, offset: 3 });
        await expectBudget("/admin/orders?limit=3&offset=9", {}, {
            list_order_read_model: 1,
        }, { items: [], total: 4, limit: 3, offset: 9 });
        await expectBudget("/me/order?id=404", { userId: buyerId }, { orders: 1 }, {
            error: "order not found",
        }, 404);
        await expectBudget("/me/sale?id=404", { userId: "missing-seller" }, { sellers: 1 }, {
            error: "sale not found",
        }, 404);
        await expectBudget("/me/sale?id=404", { userId: sellerUserId }, {
            sellers: 1, orders: 1,
        }, { error: "sale not found" }, 404);
        await expectBudget("/admin/order?id=404", {}, { orders: 1 }, {
            error: "order not found",
        }, 404);
    });
});

async function expectBudget(
    path: string,
    options: { userId?: string },
    expected: Record<string, number>,
    expectedBody?: unknown,
    expectedStatus = 200,
): Promise<void> {
    const before = capturedFetches().length;
    const response = await requestCommerce(path, options);
    const calls = capturedFetches().slice(before);
    const actual = Object.fromEntries([...new Set(calls.map(resourceName))].map(resource => [
        resource,
        calls.filter(call => resourceName(call) === resource).length,
    ]));

    expect({ path, status: response.status }).toEqual({ path, status: expectedStatus });
    if (expectedBody !== undefined) expect(await response.json()).toEqual(expectedBody);
    expect(actual).toEqual(expected);
    expect(calls).toHaveLength(Object.values(expected).reduce((sum, count) => sum + count, 0));
}

function resourceName(call: { url: string }): string {
    return new URL(call.url).pathname.split("/").at(-1)!;
}
