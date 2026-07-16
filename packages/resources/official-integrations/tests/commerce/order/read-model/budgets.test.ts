import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../harness";
import { buyerId, sellerUserId } from "./fixtures/raw";
import { useCompleteOrderResponder } from "./fixtures/responder";

installCommerceTestEnvironment();

describe("commerce current PostgREST read budgets", () => {
    test("records list budgets independently from response contracts", async () => {
        useCompleteOrderResponder();

        await expectBudget("/me/orders?limit=2&offset=2", { userId: buyerId }, {
            orders: 1, protected_order_operations: 1, custom_field_definitions: 1,
        });
        await expectBudget("/me/sales?limit=2&offset=2", { userId: sellerUserId }, {
            sellers: 1, orders: 1, custom_field_definitions: 1,
        });
        await expectBudget("/admin/orders?limit=2&offset=2", {}, {
            orders: 1, protected_order_operations: 1,
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
});

async function expectBudget(
    path: string,
    options: { userId?: string },
    expected: Record<string, number>,
): Promise<void> {
    const before = capturedFetches().length;
    const response = await requestCommerce(path, options);
    const calls = capturedFetches().slice(before);
    const actual = Object.fromEntries([...new Set(calls.map(resourceName))].map(resource => [
        resource,
        calls.filter(call => resourceName(call) === resource).length,
    ]));

    expect({ path, status: response.status }).toEqual({ path, status: 200 });
    expect(actual).toEqual(expected);
    expect(calls).toHaveLength(Object.values(expected).reduce((sum, count) => sum + count, 0));
}

function resourceName(call: { url: string }): string {
    return new URL(call.url).pathname.split("/").at(-1)!;
}
