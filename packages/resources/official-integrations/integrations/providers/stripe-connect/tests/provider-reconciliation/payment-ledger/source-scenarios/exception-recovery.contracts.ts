import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../runtime/constants";
import { okJson } from "../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../runtime/source-requests";
import type { CreatePaymentRecoveryScenarioHarness } from "./harness";

export function registerProviderExceptionRecoveryScenarios(createHarness: CreatePaymentRecoveryScenarioHarness): void {
    test("atomically clears only the transient expansion review after full provider revalidation", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "transient-provider-review-recovery",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        harness.rest.setPaymentIntentProviderReferences(paymentIntentId);
        harness.rest.seedTransientProviderTruthReview(Number(created.paymentId), paymentIntentId);

        const first = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );
        const replay = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(first).toMatchObject({
            paymentStatus: "succeeded",
            commercePaymentStatus: "succeeded",
            settlementStatus: "held",
            manualReviewReason: null,
        });
        expect(replay).toMatchObject({ commercePaymentStatus: "succeeded", settlementStatus: "held" });
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                deduplication_key: `provider-payment-truth:${created.paymentId}:${paymentIntentId}`,
                status: "resolved",
                resolved_by: "provider-truth-revalidation",
            }),
        );
        expect(
            harness.rest
                .rows("payment_events")
                .filter((row) => row.event_type === "provider_payment_truth_revalidated"),
        ).toEqual([
            expect.objectContaining({
                payment_id: created.paymentId,
                actor_kind: "reconciliation",
                previous_settlement_status: "manual_review",
                next_settlement_status: "held",
            }),
        ]);
    });

    test("keeps transient provider review fail-closed when another unresolved exception exists", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "transient-review-with-independent-risk",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        harness.rest.seedTransientProviderTruthReview(Number(created.paymentId), paymentIntentId);
        harness.rest.seedOtherOpenProviderException(Number(created.paymentId));

        const synced = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(synced).toMatchObject({
            paymentStatus: "succeeded",
            commercePaymentStatus: "manual_review",
            settlementStatus: "manual_review",
            reconciliationPending: true,
            manualReviewReason: "Stripe payment provider truth mismatch: charge_balance_transaction_expansion",
        });
        expect(
            harness.rest.rows("payment_events").some((row) => row.event_type === "provider_payment_truth_revalidated"),
        ).toBeFalse();
    });

    test("rebuilds a missing transient provider exception before recovering", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                },
                { userId: "seller-1" },
            ),
        );
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "transient-review-without-recovery-exception",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        harness.rest.seedTransientProviderTruthReview(Number(created.paymentId), paymentIntentId);
        harness.rest.removeTransientProviderTruthException(Number(created.paymentId), paymentIntentId);

        const synced = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(synced).toMatchObject({
            paymentStatus: "succeeded",
            commercePaymentStatus: "succeeded",
            settlementStatus: "held",
            manualReviewReason: null,
        });
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                deduplication_key: `provider-payment-truth:${created.paymentId}:${paymentIntentId}`,
                status: "resolved",
                resolved_by: "provider-truth-revalidation",
            }),
        );
        expect(harness.rest.rows("payment_events")).toContainEqual(
            expect.objectContaining({
                payment_id: created.paymentId,
                event_type: "provider_payment_truth_revalidated",
            }),
        );
    });
}
