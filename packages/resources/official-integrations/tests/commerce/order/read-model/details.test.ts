import { describe, expect, test } from "bun:test";
import {
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import {
    expectedAdminDetail,
    expectedBuyerDetail,
    expectedSellerDetail,
} from "./fixtures/expected-details";
import {
    buyerId,
    firstOrderPublicId,
    orderRows,
    saleRows,
    sellerUserId,
} from "./fixtures/raw";
import { callsFor, useCompleteOrderResponder } from "./fixtures/responder";

installCommerceTestEnvironment();

describe("commerce order and sale detail read contracts", () => {
    test("preserves the complete buyer detail and its public event and metadata projections", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce(`/me/order?publicId=${firstOrderPublicId}`, { userId: buyerId });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedBuyerDetail);
        const orderQuery = query("orders");
        expect(orderQuery.get("public_id")).toBe(`eq.${firstOrderPublicId}`);
        expect(query("order_lines").get("order")).toBe("id.asc");
        expect(query("order_events").get("select")).toBe(
            "id,order_id,event_type,previous_status,next_status,created_at",
        );
        expect(query("order_events").get("order")).toBe("created_at.asc,id.asc");
        expect(query("marketplace_claims").get("order")).toBe("created_at.desc");
        expect(query("marketplace_claims").get("limit")).toBe("1");
    });

    test("preserves the complete seller-safe detail and omits buyer and claim internals", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/me/sale?id=42", { userId: sellerUserId });

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body).toEqual(expectedSellerDetail);
        expect(query("orders").get("seller_id")).toBe("eq.17");
        expect(query("order_lines").get("seller_id")).toBe("eq.17");
        expect(callsFor("marketplace_claims")).toHaveLength(0);
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
        expect(query("orders").get("id")).toBe("eq.42");
        expect(query("order_events").get("select")).toBe("*");
        expect(callsFor("custom_field_definitions")).toHaveLength(0);
        expect(body).not.toHaveProperty("metadataEntries");
    });

    test("preserves id priority and the seller public-id lookup", async () => {
        useCompleteOrderResponder();

        for (const [path, userId] of [
            [`/me/order?id=42&publicId=invalid`, buyerId],
            [`/me/sale?id=42&publicId=invalid`, sellerUserId],
            ["/admin/order?id=42&publicId=invalid", undefined],
        ] as const) {
            const response = await requestCommerce(path, { userId });
            expect({ path, status: response.status }).toEqual({ path, status: 200 });
            const orderQuery = query("orders", -1);
            expect(orderQuery.get("id")).toBe("eq.42");
            expect(orderQuery.get("public_id")).toBeNull();
        }

        const seller = await requestCommerce(`/me/sale?publicId=%20${firstOrderPublicId}%20`, {
            userId: sellerUserId,
        });
        expect(seller.status).toBe(200);
        expect(await seller.json()).toEqual(expectedSellerDetail);
        expect(query("orders", -1).get("public_id")).toBe(`eq.${firstOrderPublicId}`);
    });

    test("preserves empty collections and every absent optional relation", async () => {
        setRestResponder(request => {
            const url = new URL(request.url);
            const resource = url.pathname.split("/").at(-1);
            if (resource === "orders") {
                const isSale = !url.searchParams.get("select")?.includes("seller_id");
                return jsonResponse([isSale ? saleRows[0] : orderRows[0]]);
            }
            if (resource === "sellers") {
                return jsonResponse(url.searchParams.has("cms_user_id") ? [{ id: 17 }] : []);
            }
            if (resource === "get_order_fulfillment_authorization") return jsonResponse(null);
            if ([
                "order_lines", "order_events", "protected_order_operations",
                "order_financial_terms", "order_fulfillments", "order_settlements",
                "marketplace_claims", "custom_field_definitions",
            ].includes(resource ?? "")) return jsonResponse([]);
            throw new Error(`Unexpected optional-relation request: ${request.url}`);
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

function query(resource: string, index = 0): URLSearchParams {
    const call = callsFor(resource).at(index);
    if (!call) throw new Error(`Missing ${resource} request`);
    return new URL(call.url).searchParams;
}
