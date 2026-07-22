import { describe, expect, test } from "bun:test";
import {
    accountSyncRequest,
    balanceSettingsRequest,
    clearRequests,
    type CreateProviderBoundaryHarness,
    enrollSeller,
    paymentIntentRequest,
    postgrestBody,
    postgrestBudget,
    protectedPaymentBody,
    responseBody,
    type ProviderBoundaryHarness,
} from "../harness";
import { expectedProtectedPayment } from "./expectations";
import type { ProjectionRaceHarness } from "./projection-race-harness";

const replayPreludeBudget = [
    { method: "GET", table: "accounts" },
    { method: "GET", table: "accounts" },
    { method: "PATCH", table: "accounts" },
    { method: "GET", table: "payments" },
    { method: "GET", table: "platform_payout_controls" },
];

export function registerProtectedPaymentProjectionRaceContracts(createHarness: CreateProviderBoundaryHarness): void {
    describe("stripe-connect protected payment projection race contracts", () => {
        test("rereads the replacement intent secret after an ID race wins during projection", async () => {
            const fixture = await replayFixture(createHarness);
            fixture.harness.rest.setNextProtectedPaymentProjectionScenario({
                kind: "replace-intent",
                paymentId: fixture.paymentId,
                replacementIntentId: "pi_concurrent",
            });

            const response = await replay(fixture.harness);
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(
                expectedProtectedPayment(body, {
                    stripePaymentIntentId: "pi_concurrent",
                    clientSecret: "pi_concurrent_secret",
                }),
            );
            expect(postgrestBudget(fixture.harness)).toEqual([
                ...replayPreludeBudget,
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
            ]);
            expect(postgrestBody(fixture.harness, 6).p_projection).toMatchObject({
                kind: "apply",
                stripePaymentIntentId: "pi_concurrent",
            });
            expect(fixture.harness.rest.stripeRequests).toEqual([
                accountSyncRequest(),
                balanceSettingsRequest(),
                paymentIntentRequest(fixture.paymentIntentId),
                paymentIntentRequest("pi_concurrent"),
            ]);
            expect(fixture.harness.rest.rows("payments")[0]).toMatchObject({
                stripe_payment_intent_id: "pi_concurrent",
                payment_status: "created",
            });
        });

        test("returns the final reloaded canceled intent secret after cancellation wins projection", async () => {
            const fixture = await replayFixture(createHarness);
            fixture.harness.rest.setNextProtectedPaymentProjectionScenario({
                kind: "cancel-payment",
                paymentId: fixture.paymentId,
                clientSecret: "pi_1_canceled_secret",
            });

            const response = await replay(fixture.harness);
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(
                expectedProtectedPayment(body, {
                    paymentStatus: "cancelled",
                    commercePaymentStatus: "cancelled",
                    cancelledAt: "2026-07-06T12:09:00.000Z",
                    clientSecret: "pi_1_canceled_secret",
                }),
            );
            expect(postgrestBudget(fixture.harness)).toEqual([
                ...replayPreludeBudget,
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
            ]);
            expect(postgrestBody(fixture.harness, 6).p_projection).toMatchObject({
                kind: "apply",
                stripePaymentIntentId: fixture.paymentIntentId,
            });
            expect(fixture.harness.rest.stripeRequests).toEqual([
                accountSyncRequest(),
                balanceSettingsRequest(),
                paymentIntentRequest(fixture.paymentIntentId),
                paymentIntentRequest(fixture.paymentIntentId),
            ]);
        });

        test("never reuses a quarantined snapshot secret and performs the exact fallback GET", async () => {
            const fixture = await replayFixture(createHarness);
            fixture.harness.rest.setPaymentIntentSucceeded(fixture.paymentIntentId);
            fixture.harness.rest.patchPaymentIntent(fixture.paymentIntentId, { amount: 1199 });
            fixture.harness.rest.setNextProtectedPaymentProjectionScenario({
                kind: "rotate-secret",
                paymentId: fixture.paymentId,
                clientSecret: "pi_1_fallback_secret",
            });
            const reason = "Stripe payment provider truth mismatch: payment_intent_amount";

            const response = await replay(fixture.harness);
            const body = await responseBody(response);

            expect(response.status).toBe(200);
            expect(body).toEqual(
                expectedProtectedPayment(body, {
                    stripeChargeId: "ch_1",
                    paymentStatus: "failed",
                    commercePaymentStatus: "manual_review",
                    settlementStatus: "manual_review",
                    manualReviewReason: reason,
                    clientSecret: "pi_1_fallback_secret",
                }),
            );
            expect(body.clientSecret).not.toBe("pi_1_secret");
            expect(postgrestBudget(fixture.harness)).toEqual([
                ...replayPreludeBudget,
                { method: "POST", table: "rpc/apply_payment_provider_projection" },
            ]);
            expect(postgrestBody(fixture.harness, 5).p_projection).toMatchObject({
                kind: "quarantine",
                manualReviewReason: reason,
                details: { paymentIntentId: "pi_1", mismatches: ["payment_intent_amount"] },
            });
            expect(fixture.harness.rest.stripeRequests).toEqual([
                accountSyncRequest(),
                balanceSettingsRequest(),
                paymentIntentRequest(fixture.paymentIntentId),
                paymentIntentRequest(fixture.paymentIntentId),
            ]);
        });
    });
}

async function replayFixture(createHarness: CreateProviderBoundaryHarness): Promise<{
    harness: ProjectionRaceHarness;
    paymentId: number;
    paymentIntentId: string;
}> {
    const harness = (await createHarness()) as ProjectionRaceHarness;
    expect((await enrollSeller(harness)).status).toBe(200);
    const created = await replay(harness);
    const body = await responseBody(created);
    expect(created.status).toBe(200);
    expect(body).toEqual(expectedProtectedPayment(body));
    clearRequests(harness);
    return {
        harness,
        paymentId: Number(body.paymentId),
        paymentIntentId: String(body.stripePaymentIntentId),
    };
}

async function replay(harness: ProviderBoundaryHarness): Promise<Response> {
    return await harness.submit("buyer-1", "admin", "createProtectedPayment", protectedPaymentBody());
}
