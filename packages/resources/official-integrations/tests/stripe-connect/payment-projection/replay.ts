import { describe, expect, test } from "bun:test";
import {
    createPaymentProjectionFixture,
    postgrestCalls,
    successfulJson,
    type CreatePaymentProjectionHarness,
} from "./harness";

export function registerPaymentProjectionReplayContracts(
    createHarness: CreatePaymentProjectionHarness,
): void {
    describe("stripe-connect payment projection replay contracts", () => {
        test("keeps provider freshness while deduplicating an unchanged replay", async () => {
            const fixture = await createPaymentProjectionFixture(createHarness, "projection-replay");
            await successfulJson(await fixture.read());
            const initialProjectionCount = fixture.rest.rows("commerce_projection_outbox").length;
            fixture.resetRequests();

            const body = await successfulJson(await fixture.read());

            expect(body).toMatchObject({
                paymentId: fixture.paymentId,
                paymentStatus: "created",
                commercePaymentStatus: "created",
                settlementStatus: "held",
            });
            expect(postgrestCalls(fixture)).toEqual([
                ["GET", "payments"],
                ["GET", "payments"],
                ["PATCH", "payments"],
                ["POST", "rpc/enqueue_commerce_provider_projection"],
            ]);
            expect(fixture.rest.stripeRequests).toHaveLength(1);
            expect(fixture.rest.rows("commerce_projection_outbox")).toHaveLength(initialProjectionCount);
        });

        test("keeps two concurrent refreshes coherent and idempotent", async () => {
            const fixture = await createPaymentProjectionFixture(createHarness, "projection-concurrent");
            fixture.rest.setPaymentIntentSucceeded(fixture.paymentIntentId);
            const initialProjectionCount = fixture.rest.rows("commerce_projection_outbox").length;
            fixture.resetRequests();

            const responses = await Promise.all([fixture.read(), fixture.read()]);
            const bodies = await Promise.all(responses.map(successfulJson));

            expect(bodies.map(body => ({
                paymentId: body.paymentId,
                paymentStatus: body.paymentStatus,
                commercePaymentStatus: body.commercePaymentStatus,
                settlementStatus: body.settlementStatus,
                stripeChargeId: body.stripeChargeId,
                actualStripeProcessingFeeAmount: body.actualStripeProcessingFeeAmount,
            }))).toEqual(Array(2).fill({
                paymentId: fixture.paymentId,
                paymentStatus: "succeeded",
                commercePaymentStatus: "succeeded",
                settlementStatus: "held",
                stripeChargeId: "ch_1",
                actualStripeProcessingFeeAmount: 65,
            }));
            const calls = postgrestCalls(fixture);
            expect(calls.filter(([, table]) => table === "payments")).toHaveLength(6);
            expect(calls.filter(([, table]) =>
                table === "rpc/enqueue_commerce_provider_projection"
            )).toHaveLength(2);
            expect(fixture.rest.stripeRequests).toHaveLength(2);
            expect(fixture.rest.rows("commerce_projection_outbox"))
                .toHaveLength(initialProjectionCount + 1);
        });
    });
}
