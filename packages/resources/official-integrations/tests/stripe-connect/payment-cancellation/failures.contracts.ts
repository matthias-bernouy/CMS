import { describe, expect, test } from "bun:test";
import {
    cancellationIdempotencyKey,
    type CreatePaymentCancellationHarness,
    createPaymentCancellationFixture,
    responseJson,
} from "./harness";
import { cancelRequest, retrieveRequest } from "./fixtures";

export function registerPaymentCancellationFailureContracts(createHarness: CreatePaymentCancellationHarness): void {
    describe("stripe-connect payment cancellation failure contracts", () => {
        test("fails durably when PaymentIntent creation was never reserved", async () => {
            const harness = await createHarness();
            const clientReferenceId = "cancellation-missing-create-operation";
            const cancellationRequestId = "cancel-missing-create-operation";
            const paymentId = harness.rest.seedDashboardPayment(clientReferenceId, {
                stripe_payment_intent_id: null,
                payment_status: "created",
            });
            clearRequests(harness);

            const response = await harness.submit("buyer", "cancelProtectedPayment", {
                clientReferenceId,
                cancellationRequestId,
                reason: "buyer cancelled",
            });
            const message = "PaymentIntent creation has not been durably reserved yet";

            expect(response.status).toBe(500);
            expect(await responseJson(response)).toEqual({ error: "internal error" });
            expect(harness.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/reserve_payment_cancellation_intent",
                "postgrest:GET:payments",
                "postgrest:POST:rpc/reserve_financial_operation",
                "postgrest:PATCH:financial_operations",
                "postgrest:GET:financial_operations",
                "postgrest:PATCH:financial_operations",
            ]);
            expect(harness.rest.stripeRequests).toEqual([]);
            expectFailedCancellation(harness, paymentId, message);
        });

        test("refuses creation recovery outside Stripe's idempotency safety window", async () => {
            const fixture = await createPaymentCancellationFixture(createHarness, "cancellation-stale-create");
            fixture.rest.patchPaymentLedger(fixture.paymentId, { stripe_payment_intent_id: null });
            fixture.rest.patchDashboardRow("financial_operations", fixture.creationOperationId, {
                stripe_object_id: null,
                created_at: "2020-01-01T00:00:00.000Z",
            });
            fixture.resetRequests();

            const response = await fixture.cancel();
            const message = "PaymentIntent cancellation recovery exceeded the Stripe idempotency safety window";

            expect(response.status).toBe(500);
            expect(await responseJson(response)).toEqual({ error: "internal error" });
            expect(fixture.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/reserve_payment_cancellation_intent",
                "postgrest:GET:payments",
                "postgrest:POST:rpc/reserve_financial_operation",
                "postgrest:PATCH:financial_operations",
                "postgrest:GET:financial_operations",
                "postgrest:PATCH:financial_operations",
            ]);
            expect(fixture.rest.stripeRequests).toEqual([]);
            expectFailedCancellation(fixture, fixture.paymentId, message);
        });

        test("persists the exact error when Stripe cancellation remains non-terminal", async () => {
            const fixture = await createPaymentCancellationFixture(createHarness, "cancellation-non-terminal");
            fixture.rest.keepNextPaymentCancellationNonTerminal();
            fixture.resetRequests();

            const response = await fixture.cancel();
            const message = "Stripe PaymentIntent cancellation remains non-terminal: requires_payment_method";
            const idempotencyKey = await cancellationIdempotencyKey(fixture.paymentIntentId);

            expect(response.status).toBe(500);
            expect(await responseJson(response)).toEqual({ error: "internal error" });
            expect(fixture.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/reserve_payment_cancellation_intent",
                "postgrest:GET:payments",
                "postgrest:POST:rpc/reserve_financial_operation",
                "postgrest:PATCH:financial_operations",
                `stripe:GET:/v1/payment_intents/${fixture.paymentIntentId}`,
                "postgrest:POST:rpc/apply_payment_provider_projection",
                `stripe:POST:/v1/payment_intents/${fixture.paymentIntentId}/cancel`,
                "postgrest:POST:rpc/apply_payment_provider_projection",
                "postgrest:PATCH:financial_operations",
            ]);
            expect(fixture.rest.stripeRequests).toEqual([
                retrieveRequest(fixture.paymentIntentId),
                cancelRequest(fixture.paymentIntentId, idempotencyKey),
            ]);
            expectFailedCancellation(fixture, fixture.paymentId, message);
            expect(
                fixture.rest
                    .rows("payment_events")
                    .filter((row) => String(row.event_type).startsWith("payment_intent_cancellation_")),
            ).toEqual([]);
        });
    });
}

function clearRequests(harness: Awaited<ReturnType<CreatePaymentCancellationHarness>>): void {
    harness.rest.clearPostgrestRequests();
    harness.rest.clearStripeRequests();
    harness.rest.clearExternalRequestOrder();
}

function expectFailedCancellation(
    harness: Awaited<ReturnType<CreatePaymentCancellationHarness>>,
    paymentId: number,
    message: string,
): void {
    const operations = harness.rest
        .rows("financial_operations")
        .filter((row) => row.operation_type === "payment_intent_cancel");
    expect(operations).toEqual([
        expect.objectContaining({
            payment_id: paymentId,
            status: "failed",
            stripe_object_id: null,
            last_error: message,
            attempt_count: 1,
            next_attempt_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        }),
    ]);
}
