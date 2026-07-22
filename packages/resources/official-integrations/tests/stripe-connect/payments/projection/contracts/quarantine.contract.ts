import { expect, test } from "bun:test";
import {
    createPaymentProjectionFixture,
    postgrestCalls,
    successfulJson,
    type CreatePaymentProjectionHarness,
} from "../harness";
import { successfulPaymentKeys } from "./expected-payment";

export function registerProjectionQuarantineContract(createHarness: CreatePaymentProjectionHarness): void {
    test("preserves fail-closed quarantine state, exception, event, and response", async () => {
        const fixture = await createPaymentProjectionFixture(createHarness, "projection-quarantine");
        fixture.rest.setPaymentIntentSucceeded(fixture.paymentIntentId);
        fixture.rest.patchPaymentIntent(fixture.paymentIntentId, { amount: 1199 });
        fixture.resetRequests();

        const body = await successfulJson(await fixture.read());
        const reason = "Stripe payment provider truth mismatch: payment_intent_amount";

        expect(body).toMatchObject({
            paymentId: fixture.paymentId,
            clientReferenceId: fixture.clientReferenceId,
            paymentStatus: "failed",
            commercePaymentStatus: "manual_review",
            settlementStatus: "manual_review",
            reconciliationPending: false,
            manualReviewReason: reason,
            paidAt: null,
        });
        expect(Object.keys(body).sort()).toEqual([...successfulPaymentKeys].sort());
        expect(fixture.rest.rows("provider_exceptions")).toEqual([
            expect.objectContaining({
                payment_id: fixture.paymentId,
                exception_type: "provider_payment_truth_mismatch",
                severity: "critical",
                status: "open",
                message: reason,
                details: {
                    paymentIntentId: fixture.paymentIntentId,
                    chargeId: "ch_1",
                    mismatches: ["payment_intent_amount"],
                },
            }),
        ]);
        expect(fixture.rest.rows("payment_events")).toEqual([
            expect.objectContaining({
                payment_id: fixture.paymentId,
                event_type: "provider_payment_truth_mismatch",
                actor_kind: "reconciliation",
                actor_id: "provider-sync",
                data: {
                    paymentIntentId: fixture.paymentIntentId,
                    chargeId: "ch_1",
                    mismatches: ["payment_intent_amount"],
                },
            }),
        ]);
        expect(postgrestCalls(fixture)).toEqual([
            ["GET", "payments"],
            ["POST", "rpc/apply_payment_provider_projection"],
        ]);
    });
}
