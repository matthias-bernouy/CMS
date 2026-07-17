import { describe, expect, test } from "bun:test";
import {
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../../harness";
import { expectedSellerDetail } from "../fixtures/expected-details";
import {
    adminEventRows,
    lineRows,
    publicDefinitions,
    saleRows,
    sellerUserId,
} from "../fixtures/raw";
import {
    authorization,
    operation,
    sellerFinancialTerms,
    sellerFulfillment,
    settlement,
} from "../fixtures/projections";

installCommerceTestEnvironment();

describe("commerce seller detail privacy", () => {
    test("strips private fields from every seller detail fragment", async () => {
        setRestResponder(request => {
            const resource = new URL(request.url).pathname.split("/").at(-1);
            if (resource === "sellers") return jsonResponse([{ id: 17 }]);
            if (resource === "orders") return jsonResponse([{
                ...saleRows[0], seller_id: 17, buyer_cms_user_id: "private-buyer-root",
                shipping_address: { token: "private-shipping" },
                billing_address: { token: "private-billing" },
                idempotency_key: "private-idempotency", request_hash: "private-request-hash",
                archived_at: "private-archive",
            }]);
            if (resource === "order_lines") return jsonResponse(lineRows.map(line => ({
                ...line, seller_id: 17, buyer_secret: "private-line",
            })));
            if (resource === "order_events") return jsonResponse(adminEventRows.map(event => ({
                ...event, private_event: "private-event",
            })));
            if (resource === "protected_order_operations") return jsonResponse([{
                ...operation, provider_payment_id: "private-operation-provider",
            }]);
            if (resource === "order_financial_terms") return jsonResponse([{
                ...sellerFinancialTerms, buyer_total_amount: 11_070,
                buyer_protection_fee_amount: 620, financial_terms_hash: "private-terms-hash",
                fee_policy_snapshot: { token: "private-policy" },
            }]);
            if (resource === "order_fulfillments") return jsonResponse([{
                ...sellerFulfillment, provider_reference: "private-fulfillment-provider",
                arrived_at_pickup_point_at: "private-arrival",
                available_for_pickup_at: "private-availability",
            }]);
            if (resource === "order_settlements") return jsonResponse([{
                ...settlement, platform_gross_remainder_amount: 2_070,
                provider_transfer_id: "private-transfer", manual_review_reason: "private-review",
            }]);
            if (resource === "get_order_fulfillment_authorization") return jsonResponse({
                ...authorization, delivery_quote_id: "private-quote",
                buyer_total_amount: 11_070, financial_terms_hash: "private-auth-hash",
            });
            if (resource === "custom_field_definitions") return jsonResponse(publicDefinitions);
            throw new Error(`Unexpected seller privacy request: ${request.url}`);
        });

        const response = await requestCommerce("/me/sale?id=42", { userId: sellerUserId });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(expectedSellerDetail);
        const serialized = JSON.stringify(body);
        for (const token of [
            "private-buyer-root", "private-shipping", "private-billing",
            "private-idempotency", "private-request-hash", "private-archive",
            "private-line", "private-event", "private-operation-provider",
            "private-terms-hash", "private-policy", "private-fulfillment-provider",
            "private-arrival", "private-availability", "private-transfer",
            "private-review", "private-quote", "private-auth-hash",
        ]) expect(serialized).not.toContain(token);
    });
});
