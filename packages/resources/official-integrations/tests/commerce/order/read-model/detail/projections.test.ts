import { describe, expect, test } from "bun:test";
import {
    expectRpc,
    installCommerceTestEnvironment,
    requestCommerce,
} from "../../../harness";
import { buyerId, firstOrderPublicId, sellerUserId } from "../fixtures/raw";
import { callsFor, useCompleteOrderResponder } from "../fixtures/responder";

installCommerceTestEnvironment();

const orderSelect = "id,public_id,order_number,checkout_group_id,seller_id,buyer_cms_user_id,status,currency,subtotal_amount,shipping_amount,delivery_quoted_at,total_amount,shipping_address,billing_address,metadata,idempotency_key,archived_at,version,created_at,updated_at";
const buyerLineSelect = "id,order_id,offer_id,product_id,variant_id,accepted_proposal_id,title,sku,quantity,unit_amount,total_amount,product_snapshot,variant_snapshot,offer_snapshot,seller_snapshot,created_at";
const publicEventSelect = "id,order_id,event_type,previous_status,next_status,created_at";
const buyerFinancialSelect = "order_id,delivery_quote_id,merchandise_subtotal_amount,shipping_amount,buyer_protection_fee_amount,seller_commission_amount,buyer_total_amount,seller_proceeds_amount,platform_retained_amount,currency,financial_terms_hash,pricing_locked_at,pay_by_at,financial_revision";
const buyerFulfillmentSelect = "order_id,status,seller_handoff_deadline,scan_grace_deadline,carrier_accepted_at,arrived_at_pickup_point_at,available_for_pickup_at,recipient_handoff_at,recipient_handoff_first_observed_at,claim_window_started_at,claim_by_at,release_eligible_at,blocking_reason,version";
const buyerSettlementSelect = "order_id,status,authorized_seller_amount,total_transferred_amount,total_reversed_amount,total_refunded_amount,seller_reserve_liability_remaining_amount,version";
const claimSelect = "id,public_id,reason,status,seller_response_by_at,return_ship_by_at,resolved_at,version,created_at";
const saleSelect = "id,public_id,order_number,checkout_group_id,status,currency,subtotal_amount,shipping_amount,delivery_quoted_at,total_amount,metadata,version,created_at,updated_at";
const sellerLineSelect = "id,order_id,offer_id,product_id,variant_id,accepted_proposal_id,title,sku,quantity,unit_amount,total_amount,product_snapshot,variant_snapshot,offer_snapshot,created_at";
const sellerFinancialSelect = "order_id,merchandise_subtotal_amount,shipping_amount,seller_commission_amount,platform_shipping_share_amount,seller_shipping_share_amount,seller_proceeds_amount,seller_transfer_release_amount,seller_reserve_liability_amount,currency,pricing_locked_at,pay_by_at,financial_revision";
const sellerFulfillmentSelect = "order_id,status,seller_handoff_deadline,scan_grace_deadline,seller_handoff_declared_at,carrier_accepted_at,recipient_handoff_at,recipient_handoff_first_observed_at,claim_window_started_at,claim_by_at,release_eligible_at,blocking_reason,version";
const sellerSettlementSelect = "order_id,status,authorized_seller_amount,total_transferred_amount,total_reversed_amount,seller_reserve_liability_remaining_amount,version";

describe("commerce order detail database projections", () => {
    test("locks every buyer relation projection and ordering query", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/me/order?id=42", { userId: buyerId });

        expect(response.status).toBe(200);
        expectSelect("orders", orderSelect);
        expectSelect("order_lines", buyerLineSelect);
        expectSelect("order_events", publicEventSelect);
        expectSelect("sellers", "id,kind,slug,display_name");
        expectSelect("order_financial_terms", buyerFinancialSelect);
        expectSelect("order_fulfillments", buyerFulfillmentSelect);
        expectSelect("order_settlements", buyerSettlementSelect);
        expectSelect("marketplace_claims", claimSelect);
        expectSelect("custom_field_definitions", "key,label,field_type,unit");
        expect(query("order_lines").get("order")).toBe("id.asc");
        expect(query("order_events").get("order")).toBe("created_at.asc,id.asc");
        expect(query("marketplace_claims").get("order")).toBe("created_at.desc");
    });

    test("locks every seller-safe relation projection and authorization input", async () => {
        useCompleteOrderResponder();

        const response = await requestCommerce("/me/sale?id=42", { userId: sellerUserId });

        expect(response.status).toBe(200);
        expectSelect("sellers", "id");
        expectSelect("orders", saleSelect);
        expectSelect("order_lines", sellerLineSelect);
        expectSelect("order_events", publicEventSelect);
        expectSelect("order_financial_terms", sellerFinancialSelect);
        expectSelect("order_fulfillments", sellerFulfillmentSelect);
        expectSelect("order_settlements", sellerSettlementSelect);
        expectSelect("custom_field_definitions", "key,label,field_type,unit");
        expect(expectRpc("get_order_fulfillment_authorization").body).toEqual({
            p_order_public_id: firstOrderPublicId,
        });
        expect(query("order_lines").get("seller_id")).toBe("eq.17");
        expect(query("order_lines").get("order")).toBe("id.asc");
        expect(query("order_events").get("order")).toBe("created_at.asc,id.asc");
    });
});

function expectSelect(resource: string, expected: string): void {
    expect(query(resource).get("select")).toBe(expected);
}

function query(resource: string): URLSearchParams {
    const call = callsFor(resource)[0];
    if (!call) throw new Error(`Missing ${resource} request`);
    return new URL(call.url).searchParams;
}
