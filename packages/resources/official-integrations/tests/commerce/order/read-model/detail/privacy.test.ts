import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, jsonResponse, requestCommerce, setRestResponder } from "../../../harness";
import { expectedSellerDetail } from "../fixtures/expected-details";
import { adminEventRows, lineRows, publicDefinitions, saleRows, sellerUserId } from "../fixtures/raw";
import { authorization, operation, sellerFinancialTerms, sellerFulfillment, settlement } from "../fixtures/projections";
import { completeDetailEnvelope } from "../fixtures/responder";

installCommerceTestEnvironment();

describe("commerce seller detail privacy", () => {
    test("strips private fields from every seller detail fragment", async () => {
        setRestResponder((request) => {
            expect(new URL(request.url).pathname).toEndWith("/rpc/get_order_detail_read_model");
            return jsonResponse({
                ...completeDetailEnvelope("seller"),
                order: {
                    ...saleRows[0],
                    seller_id: 17,
                    buyer_cms_user_id: "private-buyer-root",
                    shipping_address: { token: "private-shipping" },
                    billing_address: { token: "private-billing" },
                    idempotency_key: "private-idempotency",
                    request_hash: "private-request-hash",
                    archived_at: "private-archive",
                },
                lines: lineRows.map((line) => ({
                    ...line,
                    seller_id: 17,
                    buyer_secret: "private-line",
                })),
                events: adminEventRows.map((event) => ({
                    ...event,
                    private_event: "private-event",
                })),
                operation: { ...operation, provider_payment_id: "private-operation-provider" },
                financial_terms: {
                    ...sellerFinancialTerms,
                    buyer_total_amount: 11_070,
                    buyer_protection_fee_amount: 620,
                    financial_terms_hash: "private-terms-hash",
                    fee_policy_snapshot: { token: "private-policy" },
                },
                fulfillment: {
                    ...sellerFulfillment,
                    provider_reference: "private-fulfillment-provider",
                    arrived_at_pickup_point_at: "private-arrival",
                    available_for_pickup_at: "private-availability",
                },
                settlement: {
                    ...settlement,
                    platform_gross_remainder_amount: 2_070,
                    provider_transfer_id: "private-transfer",
                    manual_review_reason: "private-review",
                },
                authorization: {
                    ...authorization,
                    delivery_quote_id: "private-quote",
                    buyer_total_amount: 11_070,
                    financial_terms_hash: "private-auth-hash",
                },
                definitions: publicDefinitions,
            });
        });

        const response = await requestCommerce("/me/sale?id=42", { userId: sellerUserId });
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual(expectedSellerDetail);
        const serialized = JSON.stringify(body);
        for (const token of [
            "private-buyer-root",
            "private-shipping",
            "private-billing",
            "private-idempotency",
            "private-request-hash",
            "private-archive",
            "private-line",
            "private-event",
            "private-operation-provider",
            "private-terms-hash",
            "private-policy",
            "private-fulfillment-provider",
            "private-arrival",
            "private-availability",
            "private-transfer",
            "private-review",
            "private-quote",
            "private-auth-hash",
        ]) {
            expect(serialized).not.toContain(token);
        }
    });
});
