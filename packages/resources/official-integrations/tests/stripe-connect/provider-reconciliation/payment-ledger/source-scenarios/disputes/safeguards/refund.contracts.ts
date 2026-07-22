import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../../../runtime/constants";
import { jsonBody, okJson } from "../../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../../runtime/source-requests";
import type { CreateDisputeRecoveryScenarioHarness } from "../harness";

export function registerIndependentRefundQuarantineScenario(createHarness: CreateDisputeRecoveryScenarioHarness): void {
    test("quarantines an out-of-band refund before any seller Transfer", async () => {
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
                clientReferenceId: "order-out-of-band-refund",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );
        harness.rest.addProviderRefund("ch_1");

        const release = await sourceJson(harness, "requestSettlementRelease", {
            paymentId: created.paymentId,
            releaseAuthorizationId: "release-out-of-band-refund",
            releaseKind: "initial",
            amount: 1080,
            currency: "eur",
        });
        const payment = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(release.status).toBe(409);
        expect(await jsonBody(release)).toEqual({ error: "payment settlement is blocked or requires finance review" });
        expect(payment).toMatchObject({ settlementStatus: "manual_review" });
        expect(String(payment.manualReviewReason)).toContain("untracked Stripe refund");
        expect(harness.rest.moneyCallOrder).toEqual([]);

        harness.rest.clearProviderRefunds();
        harness.rest.addProviderDispute("ch_1", { id: "dp_won_after_manual_review", status: "won" });
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "won-dispute-must-not-clear-independent-manual-review",
                limit: 25,
            }),
        );
        const afterWonDispute = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );
        expect(afterWonDispute).toMatchObject({
            disputeStatus: "won",
            settlementStatus: "manual_review",
        });
        expect(String(afterWonDispute.manualReviewReason)).toContain("untracked Stripe refund");
    });
}
