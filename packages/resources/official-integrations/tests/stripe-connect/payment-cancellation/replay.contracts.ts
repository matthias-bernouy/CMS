import { describe, expect, test } from "bun:test";
import {
    cancellationIdempotencyKey,
    type CreatePaymentCancellationHarness,
    createPaymentCancellationFixture,
    postgrestBudget,
    responseJson,
    successfulJson,
} from "./harness";
import { cancellationResponse, cancelRequest, cancelledIntent, retrieveRequest } from "./fixtures";

export function registerPaymentCancellationReplayContracts(createHarness: CreatePaymentCancellationHarness): void {
    describe("stripe-connect payment cancellation replay contracts", () => {
        test("replays from the cancellation operation without a second Stripe cancellation", async () => {
            const fixture = await createPaymentCancellationFixture(createHarness, "cancellation-replay");
            fixture.resetRequests();

            const first = await successfulJson(await fixture.cancel());
            const operation = fixture.rest
                .rows("financial_operations")
                .find((row) => row.operation_type === "payment_intent_cancel");
            const operationId = Number(operation?.id);
            const idempotencyKey = await cancellationIdempotencyKey(fixture.paymentIntentId);

            expect(first).toEqual(cancellationResponse(fixture, operationId, fixture.paymentIntentId));
            expect(fixture.rest.stripeRequests).toEqual([
                retrieveRequest(fixture.paymentIntentId),
                cancelRequest(fixture.paymentIntentId, idempotencyKey),
            ]);
            expect(fixture.rest.postgrestRequests[5]?.body).toEqual({
                status: "succeeded",
                stripe_object_id: fixture.paymentIntentId,
                response: cancelledIntent(fixture, fixture.paymentIntentId),
                last_error: null,
                next_attempt_at: null,
                completed_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
            });

            fixture.rest.patchPaymentLedger(fixture.paymentId, { stripe_payment_intent_id: null });
            fixture.resetRequests();
            const replay = await successfulJson(await fixture.cancel());

            expect(replay).toEqual(cancellationResponse(fixture, operationId, fixture.paymentIntentId));
            expect(fixture.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/reserve_payment_cancellation_intent",
                "postgrest:POST:rpc/reserve_payment_cancellation_operation",
                "postgrest:PATCH:financial_operations",
                `stripe:GET:/v1/payment_intents/${fixture.paymentIntentId}`,
                "postgrest:POST:rpc/apply_payment_provider_projection",
                "postgrest:PATCH:financial_operations",
                "postgrest:POST:payment_events",
            ]);
            expect(postgrestBudget(fixture)).toEqual([
                ["POST", "rpc/reserve_payment_cancellation_intent"],
                ["POST", "rpc/reserve_payment_cancellation_operation"],
                ["PATCH", "financial_operations"],
                ["POST", "rpc/apply_payment_provider_projection"],
                ["PATCH", "financial_operations"],
                ["POST", "payment_events"],
            ]);
            expect(fixture.rest.stripeRequests).toEqual([retrieveRequest(fixture.paymentIntentId)]);
            expect(
                fixture.rest
                    .rows("financial_operations")
                    .filter((row) => row.operation_type === "payment_intent_cancel"),
            ).toEqual([expect.objectContaining({ id: operationId, status: "succeeded", attempt_count: 2 })]);
        });

        test("rejects a lifecycle guard pointing at different payment truth before reserving work", async () => {
            const fixture = await createPaymentCancellationFixture(createHarness, "cancellation-guard-mismatch");
            fixture.rest.patchPaymentLedger(fixture.paymentId, { client_reference_id: "different-reference" });
            fixture.resetRequests();

            const response = await fixture.cancel();

            expect(response.status).toBe(409);
            expect(await responseJson(response)).toEqual({
                error: "payment cancellation lifecycle guard does not match provider payment truth",
            });
            expect(fixture.rest.externalRequestOrder).toEqual([
                "postgrest:POST:rpc/reserve_payment_cancellation_intent",
                "postgrest:POST:rpc/reserve_payment_cancellation_operation",
            ]);
            expect(fixture.rest.stripeRequests).toEqual([]);
            expect(
                fixture.rest
                    .rows("financial_operations")
                    .filter((row) => row.operation_type === "payment_intent_cancel"),
            ).toEqual([]);
        });
    });
}
