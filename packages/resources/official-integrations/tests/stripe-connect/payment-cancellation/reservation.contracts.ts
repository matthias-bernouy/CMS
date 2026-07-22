import { describe, expect, test } from "bun:test";
import { cancellationResponse, cancelRequest, retrieveRequest } from "./fixtures";
import {
    cancellationIdempotencyKey,
    type CreatePaymentCancellationHarness,
    createPaymentCancellationFixture,
    postgrestBudget,
    responseJson,
    successfulJson,
} from "./harness";

const lifecycleAndSnapshot = ["postgrest:POST:rpc/reserve_payment_cancellation_intent", "postgrest:GET:payments"];

export function registerPaymentCancellationReservationContracts(createHarness: CreatePaymentCancellationHarness): void {
    describe("stripe-connect payment cancellation reservation contracts", () => {
        test("keeps the nominal DTO and provider/database sequence exact", async () => {
            const fixture = await createPaymentCancellationFixture(createHarness, "cancellation-reservation");
            fixture.resetRequests();

            const body = await successfulJson(await fixture.cancel());
            const operation = fixture.rest
                .rows("financial_operations")
                .find((row) => row.operation_type === "payment_intent_cancel");
            const operationId = Number(operation?.id);
            const idempotencyKey = await cancellationIdempotencyKey(fixture.paymentIntentId);

            expect(body).toEqual(cancellationResponse(fixture, operationId, fixture.paymentIntentId));
            expect(fixture.rest.externalRequestOrder).toEqual([
                ...lifecycleAndSnapshot,
                "postgrest:POST:rpc/reserve_financial_operation",
                "postgrest:PATCH:financial_operations",
                `stripe:GET:/v1/payment_intents/${fixture.paymentIntentId}`,
                "postgrest:POST:rpc/apply_payment_provider_projection",
                `stripe:POST:/v1/payment_intents/${fixture.paymentIntentId}/cancel`,
                "postgrest:POST:rpc/apply_payment_provider_projection",
                "postgrest:PATCH:financial_operations",
                "postgrest:POST:payment_events",
            ]);
            expect(postgrestBudget(fixture)).toEqual([
                ["POST", "rpc/reserve_payment_cancellation_intent"],
                ["GET", "payments"],
                ["POST", "rpc/reserve_financial_operation"],
                ["PATCH", "financial_operations"],
                ["POST", "rpc/apply_payment_provider_projection"],
                ["POST", "rpc/apply_payment_provider_projection"],
                ["PATCH", "financial_operations"],
                ["POST", "payment_events"],
            ]);
            expect(Object.fromEntries(fixture.rest.postgrestRequests[1]?.searchParams ?? [])).toMatchObject({
                id: `eq.${fixture.paymentId}`,
                limit: "1",
            });
            expect(fixture.rest.postgrestRequests[2]?.body).toEqual({
                p_payment_id: fixture.paymentId,
                p_business_key: `payment-cancellation:${fixture.paymentId}:${fixture.cancellationRequestId}`,
                p_operation_type: "payment_intent_cancel",
                p_request: {
                    clientReferenceId: fixture.clientReferenceId,
                    cancellationRequestId: fixture.cancellationRequestId,
                    reason: "buyer cancelled",
                },
            });
            expect(fixture.rest.stripeRequests).toEqual([
                retrieveRequest(fixture.paymentIntentId),
                cancelRequest(fixture.paymentIntentId, idempotencyKey),
            ]);
        });

        test("observes payment truth after lifecycle reservation before operation reservation", async () => {
            const fixture = await createPaymentCancellationFixture(createHarness, "cancellation-fresh-snapshot");
            fixture.resetRequests();
            fixture.rest.failNextPaymentCancellationOperationReservation();
            const paymentRead = fixture.rest.pauseNextPostgrestRead("payments");
            const pending = fixture.cancel();

            await paymentRead.entered;
            expect(fixture.rest.externalRequestOrder).toEqual(lifecycleAndSnapshot);
            expect(fixture.rest.rows("payment_lifecycle_guards")).toContainEqual(
                expect.objectContaining({
                    payment_id: fixture.paymentId,
                    cancellation_request_id: fixture.cancellationRequestId,
                }),
            );
            fixture.rest.patchPaymentLedger(fixture.paymentId, { client_reference_id: "concurrent-reference" });
            paymentRead.resume();

            const response = await pending;
            expect(response.status).toBe(409);
            expect(await responseJson(response)).toEqual({
                error: "payment cancellation lifecycle guard does not match provider payment truth",
            });
            expect(fixture.rest.externalRequestOrder).toEqual(lifecycleAndSnapshot);
            expect(postgrestBudget(fixture)).toEqual([
                ["POST", "rpc/reserve_payment_cancellation_intent"],
                ["GET", "payments"],
            ]);
            expect(fixture.rest.stripeRequests).toEqual([]);
        });

        test("surfaces operation reservation failure before provider work", async () => {
            const fixture = await createPaymentCancellationFixture(createHarness, "cancellation-reserve-failure");
            fixture.resetRequests();
            fixture.rest.failNextPaymentCancellationOperationReservation();

            const response = await fixture.cancel();

            expect(response.status).toBe(409);
            expect(await responseJson(response)).toEqual({
                error: "simulated payment cancellation reservation failure",
            });
            expect(fixture.rest.externalRequestOrder).toEqual([
                ...lifecycleAndSnapshot,
                "postgrest:POST:rpc/reserve_financial_operation",
            ]);
            expect(postgrestBudget(fixture)).toEqual([
                ["POST", "rpc/reserve_payment_cancellation_intent"],
                ["GET", "payments"],
                ["POST", "rpc/reserve_financial_operation"],
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
