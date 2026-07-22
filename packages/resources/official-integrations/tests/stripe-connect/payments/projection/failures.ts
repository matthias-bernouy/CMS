import { describe, expect, test } from "bun:test";
import { createPaymentProjectionFixture, successfulJson, type CreatePaymentProjectionHarness } from "./harness";

export function registerPaymentProjectionFailureContracts(createHarness: CreatePaymentProjectionHarness): void {
    describe("stripe-connect payment projection failure contracts", () => {
        test("leaves local state untouched when the provider refresh fails", async () => {
            const fixture = await createPaymentProjectionFixture(createHarness, "projection-provider-failure");
            const paymentBefore = fixture.rest.rows("payments");
            const projectionsBefore = fixture.rest.rows("commerce_projection_outbox");
            fixture.rest.failNextPaymentIntentRetrieve();
            fixture.resetRequests();

            const failed = await fixture.read();

            expect(failed.status).toBe(502);
            expect(await failed.json()).toEqual({ error: "simulated Stripe provider outage" });
            expect(fixture.rest.rows("payments")).toEqual(paymentBefore);
            expect(fixture.rest.rows("commerce_projection_outbox")).toEqual(projectionsBefore);
            expect(fixture.rest.postgrestRequests.map((request) => [request.method, request.table])).toEqual([
                ["GET", "payments"],
            ]);
            expect(fixture.rest.stripeRequests.map((request) => [request.method, request.pathname])).toEqual([
                ["GET", `/v1/payment_intents/${fixture.paymentIntentId}`],
            ]);
        });

        test("rolls back and recovers when the projection enqueue fails", async () => {
            const fixture = await createPaymentProjectionFixture(createHarness, "projection-enqueue-failure");
            fixture.rest.setPaymentIntentSucceeded(fixture.paymentIntentId);
            const initialProjectionCount = fixture.rest.rows("commerce_projection_outbox").length;
            fixture.rest.failNextPaymentProjectionEnqueue();
            fixture.resetRequests();

            const failed = await fixture.read();

            expect(failed.status).toBe(502);
            expect(await failed.json()).toEqual({ error: "simulated payment projection enqueue failure" });
            expect(fixture.rest.rows("payments")).toEqual([
                expect.objectContaining({
                    id: fixture.paymentId,
                    payment_status: "created",
                    stripe_charge_id: null,
                    actual_stripe_processing_fee_amount: 0,
                }),
            ]);
            expect(fixture.rest.rows("commerce_projection_outbox")).toHaveLength(initialProjectionCount);

            fixture.resetRequests();
            const recovered = await successfulJson(await fixture.read());
            expect(recovered).toMatchObject({
                paymentId: fixture.paymentId,
                paymentStatus: "succeeded",
                stripeChargeId: "ch_1",
            });
            expect(fixture.rest.rows("commerce_projection_outbox")).toHaveLength(initialProjectionCount + 1);
        });

        test("replays safely after the outbox committed but its response was lost", async () => {
            const fixture = await createPaymentProjectionFixture(createHarness, "projection-lost-response");
            fixture.rest.setPaymentIntentSucceeded(fixture.paymentIntentId);
            const initialProjections = fixture.rest.rows("commerce_projection_outbox");
            const initialProjectionIds = new Set(initialProjections.map((row) => row.id));
            fixture.rest.loseNextPaymentProjectionEnqueueResponse();
            fixture.resetRequests();

            const lost = await fixture.read();

            expect(lost.status).toBe(500);
            expect(await lost.json()).toEqual({ error: "internal error" });
            const projectionsAfterLostResponse = fixture.rest.rows("commerce_projection_outbox");
            expect(projectionsAfterLostResponse).toHaveLength(initialProjections.length + 1);
            const committedProjection = projectionsAfterLostResponse.find((row) => !initialProjectionIds.has(row.id));
            expect(committedProjection).toMatchObject({
                payment_id: fixture.paymentId,
                projection_kind: "payment",
                provider_object_id: String(fixture.paymentId),
            });

            fixture.resetRequests();
            const recovered = await successfulJson(await fixture.read());
            expect(recovered).toMatchObject({
                paymentId: fixture.paymentId,
                paymentStatus: "succeeded",
                stripeChargeId: "ch_1",
            });
            const projectionsAfterRetry = fixture.rest.rows("commerce_projection_outbox");
            expect(projectionsAfterRetry).toHaveLength(initialProjections.length + 1);
            expect(projectionsAfterRetry.find((row) => row.id === committedProjection?.id)).toEqual(
                committedProjection,
            );
        });

        test("quarantines stale provider truth after a concurrent intent replacement", async () => {
            const fixture = await createPaymentProjectionFixture(createHarness, "projection-intent-race");
            fixture.rest.setPaymentIntentSucceeded(fixture.paymentIntentId);
            fixture.rest.replacePaymentIntentDuringNextRetrieve(fixture.paymentId, "pi_concurrent");
            fixture.resetRequests();

            const body = await successfulJson(await fixture.read());

            expect(body).toMatchObject({
                paymentId: fixture.paymentId,
                stripePaymentIntentId: "pi_concurrent",
                paymentStatus: "failed",
                commercePaymentStatus: "manual_review",
                settlementStatus: "manual_review",
                manualReviewReason: "Stripe payment provider truth mismatch: payment_intent_id",
            });
            expect(fixture.rest.rows("payments")).toEqual([
                expect.objectContaining({
                    id: fixture.paymentId,
                    stripe_payment_intent_id: "pi_concurrent",
                    payment_status: "failed",
                    settlement_status: "manual_review",
                }),
            ]);
            expect(fixture.rest.postgrestRequests.map((request) => [request.method, request.table])).toEqual([
                ["GET", "payments"],
                ["POST", "rpc/apply_payment_provider_projection"],
                ["POST", "rpc/apply_payment_provider_projection"],
            ]);
            expect(fixture.rest.stripeRequests).toHaveLength(1);
        });
    });
}
