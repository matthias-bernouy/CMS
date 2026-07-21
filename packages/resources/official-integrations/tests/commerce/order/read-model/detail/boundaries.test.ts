import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";
import { expectedSellerDetail } from "../fixtures/expected-details";
import { buyerId, firstOrderPublicId, sellerUserId } from "../fixtures/raw";
import { callsFor, completeDetailEnvelope, useCompleteOrderResponder } from "../fixtures/responder";

installCommerceTestEnvironment();

describe("commerce order and sale detail boundaries", () => {
    test("preserves selector parsing, bigint ids, trimming, and id priority", async () => {
        const invalidSellerId = await requestCommerce(`/me/sale?id=nope&publicId=${firstOrderPublicId}`);
        expect({ status: invalidSellerId.status, body: await invalidSellerId.json() }).toEqual({
            status: 400,
            body: { error: "id must be an integer" },
        });
        expect(capturedFetches()).toHaveLength(0);

        useCompleteOrderResponder();
        const largeId = 3_000_000_000;
        for (const [route, options] of [
            ["/me/order", { userId: buyerId }],
            ["/me/sale", { userId: sellerUserId }],
            ["/admin/order", {}],
        ] as const) {
            const byId = await requestCommerce(`${route}?id=${largeId}&publicId=invalid`, options);
            expect({ route, status: byId.status }).toEqual({ route, status: 200 });
            expect(lastDetailBody()).toMatchObject({ p_id: largeId, p_public_id: null });

            const response = await requestCommerce(`${route}?publicId=%20${firstOrderPublicId}%20`, options);
            expect({ route, status: response.status }).toEqual({ route, status: 200 });
            expect(lastDetailBody()).toMatchObject({
                p_id: null,
                p_public_id: firstOrderPublicId,
            });
        }
    });

    test("keeps invalid public ids ahead of buyer identity and on the admin path", async () => {
        setRestResponder((request) => {
            expect(resourceName(request.url)).toBe("get_order_detail_read_model");
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
        setRestResponder((request) =>
            resourceName(request.url) === "get_order_detail_read_model"
                ? jsonResponse({ state: "not_found" })
                : jsonResponse({ message: "unexpected seller ownership request" }, 500),
        );

        const response = await requestCommerce(`/me/sale?publicId=${firstOrderPublicId}`, {
            userId: "other-seller",
        });

        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "sale not found" });
        expect(capturedFetches()).toHaveLength(1);
        expect(lastDetailBody()).toEqual({
            p_scope: "seller",
            p_cms_user_id: "other-seller",
            p_id: null,
            p_public_id: firstOrderPublicId,
        });
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
            metadata: {},
            metadataEntries: [],
            lines: [],
            events: [],
            operation: null,
            financialTerms: null,
            fulfillment: null,
            settlement: null,
            authorization,
        });
    });

    test("preserves a nullable seller authorization reason as an explicit null", async () => {
        usePartialSaleResponder({
            allowed: true,
            reason: null,
            orderId: 42,
            orderPublicId: firstOrderPublicId,
            sellerId: sellerUserId,
            currency: "EUR",
            paymentStatus: "succeeded",
            fulfillmentStatus: "awaiting_shipment",
        });

        const response = await requestCommerce("/me/sale?id=42", { userId: sellerUserId });
        const body = (await response.json()) as Record<string, any>;

        expect(response.status).toBe(200);
        expect(body.authorization).toHaveProperty("reason", null);
    });
});

function usePartialSaleResponder(authorization: Record<string, unknown>): void {
    setRestResponder((request) =>
        resourceName(request.url) === "get_order_detail_read_model"
            ? jsonResponse({
                  ...completeDetailEnvelope("seller"),
                  lines: [],
                  events: [],
                  operation: null,
                  financial_terms: null,
                  fulfillment: null,
                  settlement: null,
                  authorization,
                  definitions: [],
              })
            : jsonResponse({ message: "unexpected partial sale request" }, 500),
    );
}

function lastDetailBody(): Record<string, unknown> {
    const call = callsFor("get_order_detail_read_model").at(-1);
    if (!call) {
        throw new Error("Missing order detail request");
    }
    return call.body;
}

function resourceName(url: string): string {
    return new URL(url).pathname.split("/").at(-1)!;
}
