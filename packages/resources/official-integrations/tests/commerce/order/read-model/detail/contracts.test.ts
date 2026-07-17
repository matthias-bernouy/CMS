import { describe, expect, test } from "bun:test";
import {
    expectRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";
import {
    expectedAdminDetail,
    expectedBuyerDetail,
    expectedSellerDetail,
} from "../fixtures/expected-details";
import { buyerId, firstOrderPublicId, sellerUserId } from "../fixtures/raw";
import { completeDetailEnvelope, useCompleteOrderResponder } from "../fixtures/responder";

installCommerceTestEnvironment();

describe("commerce order and sale detail read contracts", () => {
    test("preserves the complete buyer detail and its public event and metadata projections", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce(`/me/order?publicId=${firstOrderPublicId}`, { userId: buyerId });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedBuyerDetail);
        expect(expectRpc("get_order_detail_read_model").body).toEqual({
            p_scope: "buyer", p_cms_user_id: buyerId,
            p_id: null, p_public_id: firstOrderPublicId,
        });
    });

    test("preserves the complete seller-safe detail and omits buyer and claim internals", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/me/sale?id=42", { userId: sellerUserId });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual(expectedSellerDetail);
        expect(expectRpc("get_order_detail_read_model").body).toEqual({
            p_scope: "seller", p_cms_user_id: sellerUserId,
            p_id: 42, p_public_id: null,
        });
        expect(JSON.stringify(body)).not.toContain(buyerId);
        expect(JSON.stringify(body)).not.toContain("terms-hash-42");
        expect(body).not.toHaveProperty("claim");
    });

    test("preserves the complete administrator detail, raw events, metadata, and claim", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/admin/order?id=42");

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual(expectedAdminDetail);
        expect(expectRpc("get_order_detail_read_model").body).toEqual({
            p_scope: "admin", p_cms_user_id: null,
            p_id: 42, p_public_id: null,
        });
        expect(body).not.toHaveProperty("metadataEntries");
    });

    test("preserves empty collections and every absent optional relation", async () => {
        setRestResponder(async request => {
            const body = await request.json() as { p_scope: "buyer" | "seller" | "admin" };
            return jsonResponse({
                ...completeDetailEnvelope(body.p_scope),
                lines: [], events: [], seller: null, operation: null,
                financial_terms: null, fulfillment: null, settlement: null,
                claim: null, authorization: null, definitions: [],
            });
        });

        const buyer = await requestCommerce("/me/order?id=42", { userId: buyerId });
        expect(await buyer.json()).toEqual({
            ...expectedBuyerDetail,
            metadata: {}, metadataEntries: [], lines: [], events: [], seller: null,
            operation: null, financialTerms: null, fulfillment: null, settlement: null, claim: null,
        });
        const seller = await requestCommerce("/me/sale?id=42", { userId: sellerUserId });
        expect(await seller.json()).toEqual({
            ...expectedSellerDetail,
            metadata: {}, metadataEntries: [], lines: [], events: [], operation: null,
            financialTerms: null, fulfillment: null, settlement: null, authorization: null,
        });
        const admin = await requestCommerce("/admin/order?id=42");
        expect(await admin.json()).toEqual({
            ...expectedAdminDetail,
            lines: [], events: [], seller: null, operation: null, financialTerms: null,
            fulfillment: null, settlement: null, claim: null,
        });
    });
});
