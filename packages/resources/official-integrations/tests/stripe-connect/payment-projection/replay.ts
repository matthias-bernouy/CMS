import { describe, expect, test } from "bun:test";
import {
    createPaymentProjectionFixture,
    postgrestCalls,
    successfulJson,
    type CreatePaymentProjectionHarness,
} from "./harness";

export function registerPaymentProjectionReplayContracts(createHarness: CreatePaymentProjectionHarness): void {
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
                ["POST", "rpc/apply_payment_provider_projection"],
            ]);
            expect(fixture.rest.stripeRequests).toHaveLength(1);
            expect(fixture.rest.rows("commerce_projection_outbox")).toHaveLength(initialProjectionCount);
        });

        test("coalesces an identical refresh burst without CAS amplification", async () => {
            const fixture = await createPaymentProjectionFixture(createHarness, "projection-concurrent");
            fixture.rest.setPaymentIntentSucceeded(fixture.paymentIntentId);
            const initialProjectionCount = fixture.rest.rows("commerce_projection_outbox").length;
            fixture.resetRequests();

            const concurrentRefreshCount = 6;
            const responses = await Promise.all(
                Array.from({ length: concurrentRefreshCount }, async () => await fixture.read()),
            );
            const bodies = await Promise.all(responses.map(successfulJson));

            const stableDtos = bodies.map((body) => ({
                paymentId: body.paymentId,
                paymentStatus: body.paymentStatus,
                commercePaymentStatus: body.commercePaymentStatus,
                settlementStatus: body.settlementStatus,
                stripeChargeId: body.stripeChargeId,
                actualStripeProcessingFeeAmount: body.actualStripeProcessingFeeAmount,
                paidAt: body.paidAt,
            }));
            expect(stableDtos).toEqual(
                Array(concurrentRefreshCount).fill({
                    paymentId: fixture.paymentId,
                    paymentStatus: "succeeded",
                    commercePaymentStatus: "succeeded",
                    settlementStatus: "held",
                    stripeChargeId: "ch_1",
                    actualStripeProcessingFeeAmount: 65,
                    paidAt: bodies[0]?.paidAt,
                }),
            );
            expect(bodies.every((body) => typeof body.lastProviderSyncAt === "string")).toBe(true);
            const calls = postgrestCalls(fixture);
            expect(calls.filter(([, table]) => table === "payments")).toHaveLength(concurrentRefreshCount);
            expect(calls.filter(([, table]) => table === "rpc/apply_payment_provider_projection")).toHaveLength(
                concurrentRefreshCount,
            );
            expect(fixture.rest.stripeRequests).toHaveLength(concurrentRefreshCount);
            const persisted = fixture.rest.rows("payments").find((row) => row.id === fixture.paymentId);
            expect(bodies.map((body) => body.lastProviderSyncAt)).toContain(persisted?.last_provider_sync_at);
            expect(fixture.rest.rows("commerce_projection_outbox")).toHaveLength(initialProjectionCount + 1);
        });
    });
}
