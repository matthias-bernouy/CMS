import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";
import { expectedSellerDetail } from "../fixtures/expected-details";
import { buyerId, firstOrderPublicId, saleRows, sellerUserId } from "../fixtures/raw";
import { callsFor, useCompleteOrderResponder } from "../fixtures/responder";

installCommerceTestEnvironment();

describe("commerce order and sale detail boundaries", () => {
    test("preserves selector parsing, bigint ids, trimming, and id priority", async () => {
        const invalidSellerId = await requestCommerce(
            `/me/sale?id=nope&publicId=${firstOrderPublicId}`,
        );
        expect({ status: invalidSellerId.status, body: await invalidSellerId.json() }).toEqual({
            status: 400, body: { error: "id must be an integer" },
        });
        expect(capturedFetches()).toHaveLength(0);

        useCompleteOrderResponder();
        const largeId = 3_000_000_000;
        for (const [route, options] of [
            ["/me/order", { userId: buyerId }],
            ["/me/sale", { userId: sellerUserId }],
            ["/admin/order", {}],
        ] as const) {
            const byId = await requestCommerce(
                `${route}?id=${largeId}&publicId=invalid`, options,
            );
            expect({ route, status: byId.status }).toEqual({ route, status: 200 });
            expect(lastOrderQuery().get("id")).toBe(`eq.${largeId}`);
            expect(lastOrderQuery().get("public_id")).toBeNull();

            const response = await requestCommerce(
                `${route}?publicId=%20${firstOrderPublicId}%20`, options,
            );
            expect({ route, status: response.status }).toEqual({ route, status: 200 });
            expect(lastOrderQuery().get("public_id")).toBe(`eq.${firstOrderPublicId}`);
        }
    });

    test("keeps invalid public ids ahead of buyer identity and on the admin path", async () => {
        setRestResponder(request => {
            expect(resourceName(request.url)).toBe("orders");
            return jsonResponse({ message: "invalid input syntax for type uuid: invalid" }, 400);
        });
        for (const route of ["/me/order", "/admin/order"]) {
            const before = capturedFetches().length;
            const response = await requestCommerce(`${route}?publicId=invalid`);
            expect({ route, status: response.status, body: await response.json() }).toEqual({
                route,
                status: 422,
                body: { error: "invalid input syntax for type uuid: invalid" },
            });
            expect(capturedFetches().slice(before)).toHaveLength(1);
        }
    });

    test("applies seller ownership to public-id lookups before hydration", async () => {
        setRestResponder(request => {
            const url = new URL(request.url);
            const resource = resourceName(request.url);
            if (resource === "sellers") return jsonResponse([{ id: 99 }]);
            if (resource === "orders") {
                expect(url.searchParams.get("public_id")).toBe(`eq.${firstOrderPublicId}`);
                expect(url.searchParams.get("seller_id")).toBe("eq.99");
                return jsonResponse([]);
            }
            throw new Error(`Unexpected seller ownership request: ${request.url}`);
        });

        const response = await requestCommerce(`/me/sale?publicId=${firstOrderPublicId}`, {
            userId: "other-seller",
        });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "sale not found" });
        expect(capturedFetches()).toHaveLength(2);
    });

    test("preserves real authorization objects on partially initialized sales", async () => {
        const authorization = {
            allowed: false,
            reason: "financial_terms_missing",
            orderId: 42,
            orderPublicId: firstOrderPublicId,
            sellerId: sellerUserId,
            currency: "",
            paymentStatus: "created",
            fulfillmentStatus: "uninitialized",
        };
        usePartialSaleResponder(authorization);

        const response = await requestCommerce("/me/sale?id=42", { userId: sellerUserId });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            ...expectedSellerDetail,
            metadata: {}, metadataEntries: [], lines: [], events: [],
            operation: null, financialTerms: null, fulfillment: null, settlement: null,
            authorization,
        });
    });

    test("preserves a nullable seller authorization reason as an explicit null", async () => {
        usePartialSaleResponder({
            allowed: true, reason: null, orderId: 42, orderPublicId: firstOrderPublicId,
            sellerId: sellerUserId, currency: "EUR", paymentStatus: "succeeded",
            fulfillmentStatus: "awaiting_shipment",
        });

        const response = await requestCommerce("/me/sale?id=42", { userId: sellerUserId });
        const body = await response.json() as Record<string, any>;

        expect(response.status).toBe(200);
        expect(body.authorization).toHaveProperty("reason", null);
    });
});

function usePartialSaleResponder(authorization: Record<string, unknown>): void {
    setRestResponder(request => {
        const resource = resourceName(request.url);
        if (resource === "sellers") return jsonResponse([{ id: 17 }]);
        if (resource === "orders") return jsonResponse([saleRows[0]]);
        if (resource === "get_order_fulfillment_authorization") return jsonResponse(authorization);
        if (["order_lines", "order_events", "custom_field_definitions"].includes(resource)) {
            return jsonResponse([]);
        }
        if ([
            "protected_order_operations", "order_financial_terms",
            "order_fulfillments", "order_settlements",
        ].includes(resource)) return jsonResponse([]);
        throw new Error(`Unexpected partial sale request: ${request.url}`);
    });
}

function lastOrderQuery(): URLSearchParams {
    const call = callsFor("orders").at(-1);
    if (!call) throw new Error("Missing orders request");
    return new URL(call.url).searchParams;
}

function resourceName(url: string): string {
    return new URL(url).pathname.split("/").at(-1)!;
}
