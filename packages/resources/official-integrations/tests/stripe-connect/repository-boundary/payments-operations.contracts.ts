import { describe, expect, test } from "bun:test";
import {
    clearRequests,
    createProtectedPayment,
    type CreateRepositoryBoundaryHarness,
    enrollSeller,
    postgrestBody,
    postgrestBudget,
    postgrestQuery,
    responseBody,
} from "./harness";

const cancellationRequestId = "repository-cancellation-1";

export function registerPaymentOperationRepositoryContracts(createHarness: CreateRepositoryBoundaryHarness): void {
    describe("stripe-connect payment and operation repository contracts", () => {
        test("reserves an absent payment cancellation with an explicit null reason", async () => {
            const harness = await createHarness();

            const response = await harness.submit("", undefined, "cancelProtectedPayment", {
                clientReferenceId: "repository-absent-order",
                cancellationRequestId,
            });

            expect(response.status).toBe(200);
            expect(await responseBody(response)).toEqual({
                cancellationRequestId,
                providerStatus: "absent",
                providerPaymentAbsent: true,
                providerEventId: `payment-cancellation-absent:${cancellationRequestId}`,
                occurredAt: "2026-07-06T12:04:00.000Z",
            });
            expect(postgrestBudget(harness)).toEqual([
                { method: "POST", table: "rpc/reserve_payment_cancellation_intent" },
            ]);
            expect(postgrestBody(harness, 0)).toEqual({
                p_client_reference_id: "repository-absent-order",
                p_cancellation_request_id: cancellationRequestId,
                p_reason: null,
            });
            expect(harness.rest.rows("payment_lifecycle_guards")).toEqual([
                expect.objectContaining({
                    client_reference_id: "repository-absent-order",
                    payment_id: null,
                    cancellation_request_id: cancellationRequestId,
                    cancellation_reason: "Commerce requested provider payment cancellation",
                }),
            ]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });

        test("keeps payment cancellation reservation, operation, and event writes ordered", async () => {
            const harness = await createHarness();
            expect((await enrollSeller(harness)).status).toBe(200);
            clearRequests(harness);
            const createdResponse = await createProtectedPayment(harness);
            expect(createdResponse.status).toBe(200);
            const created = await responseBody(createdResponse);
            const paymentReadIndex = harness.rest.postgrestRequests.findIndex(
                ({ method, table }) => method === "GET" && table === "payments",
            );
            const reservationIndex = harness.rest.postgrestRequests.findIndex(
                ({ table }) => table === "rpc/reserve_protected_payment",
            );
            expect(postgrestQuery(harness, paymentReadIndex)).toMatchObject({
                client_reference_id: "eq.repository-order-1",
                limit: "1",
            });
            expect(postgrestBody(harness, reservationIndex)).toEqual({
                p_payment: {
                    client_reference_id: "repository-order-1",
                    financial_terms_hash: "a".repeat(64),
                    financial_revision: 1,
                    dual_approval_threshold_amount: 1000,
                    buyer_cms_user_id: "buyer-1",
                    seller_cms_user_id: "seller-1",
                    seller_stripe_account_id: "acct_custom_identity_123",
                    transfer_group: expect.stringMatching(/^cms_order_[a-f0-9]{64}$/),
                    currency: "eur",
                    amount_total: 1200,
                    seller_transfer_amount: 1080,
                    platform_retained_amount: 120,
                    payment_status: "created",
                    settlement_status: "held",
                    description: null,
                },
            });

            clearRequests(harness);
            const response = await harness.submit("", undefined, "cancelProtectedPayment", {
                clientReferenceId: "repository-order-1",
                cancellationRequestId,
                reason: "buyer cancelled",
            });
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toMatchObject({
                cancellationRequestId,
                providerStatus: "canceled",
                providerPaymentAbsent: false,
                paymentStatus: "cancelled",
                providerPaymentId: created.paymentId,
                providerPaymentIntentId: created.stripePaymentIntentId,
            });
            expect(postgrestBudget(harness)).toEqual([
                { method: "POST", table: "rpc/reserve_payment_cancellation_intent" },
                { method: "GET", table: "payments" },
                { method: "POST", table: "rpc/reserve_financial_operation" },
                { method: "PATCH", table: "financial_operations" },
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
                { method: "PATCH", table: "financial_operations" },
                { method: "POST", table: "payment_events" },
            ]);
            expect(postgrestQuery(harness, 1)).toMatchObject({ id: `eq.${created.paymentId}`, limit: "1" });
            expect(postgrestBody(harness, 2)).toEqual({
                p_payment_id: created.paymentId,
                p_business_key: `payment-cancellation:${created.paymentId}:${cancellationRequestId}`,
                p_operation_type: "payment_intent_cancel",
                p_request: {
                    clientReferenceId: "repository-order-1",
                    cancellationRequestId,
                    reason: "buyer cancelled",
                },
            });
            expect(postgrestBody(harness, 3)).toMatchObject({ status: "processing", attempt_count: 1 });
            expect(postgrestBody(harness, 6)).toMatchObject({
                status: "succeeded",
                stripe_object_id: created.stripePaymentIntentId,
                last_error: null,
                next_attempt_at: null,
            });
            expect(postgrestBody(harness, 7)).toEqual({
                payment_id: created.paymentId,
                event_type: "payment_intent_cancellation_confirmed",
                actor_kind: "system",
                actor_id: cancellationRequestId,
                data: {
                    operationId: body.providerOperationId,
                    paymentIntentId: created.stripePaymentIntentId,
                },
            });
        });
    });
}
