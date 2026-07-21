import { describe, expect, test } from "bun:test";
import {
    expectRpc,
    expectSingleRpc,
    installCommerceTestEnvironment,
    requestCommerce,
    setRestResponder,
} from "../harness";

installCommerceTestEnvironment();

describe("commerce protected C2C financial routes", () => {
    test("loads delivery quote preflight data from Commerce ownership rather than browser input", async () => {
        setRestResponder(() =>
            Response.json({
                orderId: 42,
                shippingAddress: {
                    postal_code: "75001",
                    delivery_notes: { access_code: "A42" },
                },
            }),
        );

        const response = await requestCommerce(
            "/system/order/delivery-quote/authorization?orderPublicId=d22fe7f0-2df6-45fc-a835-68f67fb9d483",
            { method: "GET", userId: "buyer-17" },
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            orderId: 42,
            shippingAddress: {
                postalCode: "75001",
                deliveryNotes: { accessCode: "A42" },
            },
        });
        expect(expectSingleRpc("get_order_delivery_quote_authorization").body).toEqual({
            p_public_id: "d22fe7f0-2df6-45fc-a835-68f67fb9d483",
            p_buyer_cms_user_id: "buyer-17",
        });
    });

    test("prepares payment from immutable Commerce terms and trusted buyer identity", async () => {
        const response = await requestCommerce("/me/order/payment/prepare", {
            userId: "buyer-17",
            body: { orderId: 42, amount: 1, sellerId: "spoofed", currency: "usd" },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("prepare_protected_payment").body).toEqual({
            p_order_id: 42,
            p_buyer_cms_user_id: "buyer-17",
        });
    });

    test("records a provider payment without allowing an amount-less projection", async () => {
        const response = await requestCommerce("/system/order/payment", {
            body: {
                orderPublicId: "d22fe7f0-2df6-45fc-a835-68f67fb9d483",
                providerEventId: "evt_1",
                providerPaymentId: 73,
                providerPaymentIntentId: "pi_1",
                providerChargeId: "ch_1",
                status: "succeeded",
                amount: 12_500,
                currency: "EUR",
                financialTermsHash: "terms-hash",
                occurredAt: "2026-07-13T09:00:00.000Z",
                providerSnapshot: { livemode: false },
            },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("record_order_payment_projection").body).toEqual({
            p_order_public_id: "d22fe7f0-2df6-45fc-a835-68f67fb9d483",
            p_provider_event_id: "evt_1",
            p_provider_payment_id: 73,
            p_provider_payment_intent_id: "pi_1",
            p_provider_charge_id: "ch_1",
            p_status: "succeeded",
            p_amount: 12_500,
            p_currency: "eur",
            p_financial_terms_hash: "terms-hash",
            p_occurred_at: "2026-07-13T09:00:00.000Z",
            p_provider_snapshot: { livemode: false },
        });
    });

    test("rejects a non-numeric provider ledger id before reaching PostgreSQL", async () => {
        const response = await requestCommerce("/system/order/payment", {
            body: {
                orderPublicId: "d22fe7f0-2df6-45fc-a835-68f67fb9d483",
                providerEventId: "evt_1",
                providerPaymentId: "pi_untrusted",
                status: "succeeded",
                amount: 12_500,
                currency: "EUR",
                financialTermsHash: "terms-hash",
                occurredAt: "2026-07-13T09:00:00.000Z",
            },
        });

        expect(response.status).toBe(400);
    });

    test("records settlement operation identifiers and authorization references", async () => {
        const response = await requestCommerce("/system/order/settlement", {
            body: {
                orderPublicId: "d22fe7f0-2df6-45fc-a835-68f67fb9d483",
                providerEventId: "evt_transfer_1",
                operationType: "transfer",
                providerOperationId: 81,
                status: "succeeded",
                amount: 10_000,
                currency: "EUR",
                occurredAt: "2026-07-13T10:00:00.000Z",
                releaseAuthorizationId: "0190f184-6a59-7441-bbf5-e48ce96c1150",
            },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("record_order_settlement_projection").body).toMatchObject({
            p_provider_event_id: "evt_transfer_1",
            p_operation_type: "transfer",
            p_provider_operation_id: 81,
            p_release_authorization_id: "0190f184-6a59-7441-bbf5-e48ce96c1150",
            p_refund_request_id: null,
            p_refund_business_key: null,
            p_amount: 10_000,
            p_currency: "eur",
        });
    });

    test("keeps provider and Commerce refund correlations distinct", async () => {
        const response = await requestCommerce("/system/order/settlement", {
            body: {
                orderPublicId: "d22fe7f0-2df6-45fc-a835-68f67fb9d483",
                providerEventId: "evt_refund_1",
                operationType: "refund",
                providerOperationId: 82,
                status: "succeeded",
                amount: 8_000,
                currency: "EUR",
                occurredAt: "2026-07-13T10:00:00.000Z",
                refundRequestId: "refund:42:business-key",
                commerceRefundRequestId: 19,
            },
        });

        expect(response.status).toBe(200);
        expect(expectSingleRpc("record_order_settlement_projection").body).toMatchObject({
            p_refund_request_id: 19,
            p_refund_business_key: "refund:42:business-key",
        });
    });

    test("claims durable release and refund authorization batches", async () => {
        const release = await requestCommerce("/system/order/releases/due", {
            body: { runKey: "release-run-1", limit: 12 },
        });
        expect(release.status).toBe(200);
        expect(expectSingleRpc("authorize_due_order_releases").body).toEqual({
            p_run_key: "release-run-1",
            p_limit: 12,
        });

        const refunds = await requestCommerce("/system/order/refunds/pending", {
            body: { runKey: "refund-run-1", limit: 8 },
        });
        expect(refunds.status).toBe(200);
        expect(expectRpc("pending_order_refund_authorizations").body).toEqual({
            p_run_key: "refund-run-1",
            p_limit: 8,
        });

        const cancellations = await requestCommerce("/system/order/payment-cancellations/pending", {
            body: { runKey: "payment-cancellation-run-1", limit: 6 },
        });
        expect(cancellations.status).toBe(200);
        expect(expectRpc("pending_payment_cancellation_authorizations").body).toEqual({
            p_run_key: "payment-cancellation-run-1",
            p_limit: 6,
        });
    });
});
