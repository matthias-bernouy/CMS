import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, requestCommerce } from "../../harness";
import {
    expectedAdminDetail,
    expectedBuyerDetail,
    expectedSellerDetail,
} from "./fixtures/expected-details";
import { buyerId, sellerUserId } from "./fixtures/raw";
import { callsFor, useCompleteOrderResponder } from "./fixtures/responder";

installCommerceTestEnvironment();

describe("commerce order and sale detail read contracts", () => {
    test("preserves the complete buyer detail and its public event and metadata projections", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/me/order?publicId=order-public-42", { userId: buyerId });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(expectedBuyerDetail);
        const orderQuery = query("orders");
        expect(orderQuery.get("public_id")).toBe("eq.order-public-42");
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
});

function query(resource: string): URLSearchParams {
    const call = callsFor(resource)[0];
    if (!call) throw new Error(`Missing ${resource} request`);
    return new URL(call.url).searchParams;
}
