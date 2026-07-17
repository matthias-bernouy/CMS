import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";
import { buyerId, orderRows, saleRows, sellerUserId } from "../fixtures/raw";

installCommerceTestEnvironment();

describe("commerce order and sale detail failures", () => {
    test("preserves seller-profile and owned-order lookup failures", async () => {
        setRestResponder(() => jsonResponse({ message: "seller lookup unavailable" }, 503));
        const sellerFailure = await requestCommerce("/me/sale?id=42", { userId: sellerUserId });
        expect({ status: sellerFailure.status, body: await sellerFailure.json() }).toEqual({
            status: 502, body: { error: "seller lookup unavailable" },
        });
        expect(capturedFetches()).toHaveLength(1);

        setRestResponder(request => resourceName(request.url) === "sellers"
            ? jsonResponse([{ id: 17 }])
            : jsonResponse({ message: "sale lookup unavailable" }, 503));
        const before = capturedFetches().length;
        const orderFailure = await requestCommerce("/me/sale?id=42", { userId: sellerUserId });
        expect({ status: orderFailure.status, body: await orderFailure.json() }).toEqual({
            status: 502, body: { error: "sale lookup unavailable" },
        });
        expect(capturedFetches().slice(before)).toHaveLength(2);
    });

    test("preserves actor-specific hydration failure messages", async () => {
        const cases = [
            {
                route: "/me/order?id=42",
                options: { userId: buyerId },
                target: "custom_field_definitions",
                message: "metadata definitions unavailable",
                sale: false,
            },
            {
                route: "/me/sale?id=42",
                options: { userId: sellerUserId },
                target: "get_order_fulfillment_authorization",
                message: "authorization unavailable",
                sale: true,
            },
            {
                route: "/admin/order?id=42",
                options: {},
                target: "marketplace_claims",
                message: "claim lookup unavailable",
                sale: false,
            },
        ] as const;
        for (const { route, options, target, message, sale } of cases) {
            setRestResponder(request => {
                const resource = resourceName(request.url);
                if (resource === target) return jsonResponse({ message }, 503);
                if (resource === "orders") return jsonResponse([sale ? saleRows[0] : orderRows[0]]);
                if (resource === "sellers") {
                    const url = new URL(request.url);
                    return jsonResponse(url.searchParams.has("cms_user_id")
                        ? [{ id: 17 }]
                        : [{ id: 17, kind: "user", slug: "seller-17", display_name: "Seller 17" }]);
                }
                if (resource === "get_order_fulfillment_authorization") return jsonResponse({});
                if ([
                    "order_lines", "order_events", "protected_order_operations",
                    "order_financial_terms", "order_fulfillments", "order_settlements",
                    "marketplace_claims", "custom_field_definitions",
                ].includes(resource)) return jsonResponse([]);
                throw new Error(`Unexpected hydration failure request: ${request.url}`);
            });
            const response = await requestCommerce(route, options);
            expect({ route, status: response.status, body: await response.json() }).toEqual({
                route, status: 502, body: { error: message },
            });
        }
    });
});

function resourceName(url: string): string {
    return new URL(url).pathname.split("/").at(-1)!;
}
