import { describe, expect, test } from "bun:test";
import {
    cancellationIdempotencyKey,
    type CreatePaymentCancellationHarness,
    createPaymentCancellationFixture,
    successfulJson,
} from "./harness";
import { cancellationResponse, cancelRequest, createRequest, retrieveRequest } from "./fixtures";

export function registerPaymentCancellationRecoveryContracts(createHarness: CreatePaymentCancellationHarness): void {
    describe("stripe-connect payment cancellation recovery contracts", () => {
        test("recovers the PaymentIntent ID from its durable creation operation", async () => {
            const fixture = await createPaymentCancellationFixture(createHarness, "cancellation-operation-id");
            fixture.rest.patchPaymentLedger(fixture.paymentId, { stripe_payment_intent_id: null });
            fixture.resetRequests();

            const body = await successfulJson(await fixture.cancel());
            const cancellationOperationId = cancellationOperation(fixture);
            const idempotencyKey = await cancellationIdempotencyKey(fixture.paymentIntentId);

            expect(body).toEqual(cancellationResponse(fixture, cancellationOperationId, fixture.paymentIntentId));
            expect(fixture.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/reserve_payment_cancellation_intent",
                "postgrest:POST:rpc/reserve_payment_cancellation_operation",
                "postgrest:PATCH:financial_operations",
                "postgrest:GET:financial_operations",
                `stripe:GET:/v1/payment_intents/${fixture.paymentIntentId}`,
                "postgrest:POST:rpc/apply_payment_provider_projection",
                `stripe:POST:/v1/payment_intents/${fixture.paymentIntentId}/cancel`,
                "postgrest:POST:rpc/apply_payment_provider_projection",
                "postgrest:PATCH:financial_operations",
                "postgrest:POST:payment_events",
            ]);
            expect(fixture.rest.stripeRequests).toEqual([
                retrieveRequest(fixture.paymentIntentId),
                cancelRequest(fixture.paymentIntentId, idempotencyKey),
            ]);
            expect(fixture.rest.postgrestRequests[3]?.body).toBeNull();
            expect(Object.fromEntries(fixture.rest.postgrestRequests[3]?.searchParams ?? [])).toMatchObject({
                business_key: `eq.payment:${fixture.paymentId}:${"a".repeat(64)}`,
                select: "id,stripe_object_id,created_at",
                limit: "1",
            });
        });

        test("recreates a PaymentIntent inside the safety window before cancelling it", async () => {
            const fixture = await createPaymentCancellationFixture(createHarness, "cancellation-create-recovery");
            fixture.rest.patchPaymentLedger(fixture.paymentId, { stripe_payment_intent_id: null });
            fixture.rest.patchDashboardRow("financial_operations", fixture.creationOperationId, {
                status: "reserved",
                stripe_object_id: null,
                response: null,
                created_at: new Date().toISOString(),
            });
            fixture.resetRequests();

            const body = await successfulJson(await fixture.cancel());
            const recoveredIntentId = "pi_2";
            const cancellationOperationId = cancellationOperation(fixture);
            const idempotencyKey = await cancellationIdempotencyKey(recoveredIntentId);

            expect(body).toEqual(cancellationResponse(fixture, cancellationOperationId, recoveredIntentId));
            expect(fixture.rest.paymentIntentCreateCount).toBe(2);
            expect(fixture.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/reserve_payment_cancellation_intent",
                "postgrest:POST:rpc/reserve_payment_cancellation_operation",
                "postgrest:PATCH:financial_operations",
                "postgrest:GET:financial_operations",
                "stripe:POST:/v1/payment_intents",
                "postgrest:POST:rpc/apply_payment_provider_projection",
                "postgrest:PATCH:financial_operations",
                "postgrest:POST:rpc/apply_payment_provider_projection",
                `stripe:POST:/v1/payment_intents/${recoveredIntentId}/cancel`,
                "postgrest:POST:rpc/apply_payment_provider_projection",
                "postgrest:PATCH:financial_operations",
                "postgrest:POST:payment_events",
            ]);
            expect(fixture.rest.stripeRequests).toEqual([
                createRequest(fixture),
                cancelRequest(recoveredIntentId, idempotencyKey),
            ]);
            expect(
                fixture.rest.rows("financial_operations").find((row) => row.id === fixture.creationOperationId),
            ).toEqual(
                expect.objectContaining({
                    status: "succeeded",
                    stripe_object_id: recoveredIntentId,
                    last_error: null,
                }),
            );
        });
    });
}

function cancellationOperation(fixture: Awaited<ReturnType<typeof createPaymentCancellationFixture>>): number {
    const operation = fixture.rest
        .rows("financial_operations")
        .find((row) => row.operation_type === "payment_intent_cancel");
    const id = Number(operation?.id);
    if (!Number.isSafeInteger(id)) {
        throw new Error("missing payment cancellation operation");
    }
    return id;
}
