import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../../runtime/constants";
import { okJson } from "../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../runtime/source-requests";
import type { CreateDisputeRecoveryScenarioHarness } from "./harness";

export function registerDisputeDebtRecoveryScenarios(createHarness: CreateDisputeRecoveryScenarioHarness): void {
    test("keeps an open dispute blocked after a successful seller Transfer Reversal", async () => {
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
                clientReferenceId: "order-open-dispute-after-release",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-before-open-dispute",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        harness.rest.addProviderDispute("ch_1", { id: "dp_open_after_release", status: "needs_response" });

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "open-dispute-reversal-remains-blocked",
                limit: 25,
            }),
        );
        const payment = harness.rest.rows("payments")[0];

        expect(payment).toMatchObject({
            dispute_status: "open",
            settlement_status: "manual_review",
            transferred_amount: 1080,
            reversed_amount: 1080,
            manual_review_reason: "Stripe dispute dp_open_after_release after Transfer",
        });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "reversal"]);
    });

    test("records a lost dispute as seller debt instead of transient exposure", async () => {
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
                clientReferenceId: "order-lost-dispute-debt",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-before-lost-dispute",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        harness.rest.addProviderDispute("ch_1", { id: "dp_lost_after_release", status: "lost" });

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "lost-dispute-records-debt",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("payments")[0]).toMatchObject({
            dispute_status: "lost",
            settlement_status: "manual_review",
        });
        expect(harness.rest.rows("seller_recovery_exposures")[0]).toMatchObject({
            exposure_type: "chargeback",
            status: "debt",
            amount: 1080,
            recovered_amount: 0,
        });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer"]);
    });
}
