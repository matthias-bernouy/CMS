import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../../runtime/constants";
import { okJson } from "../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../runtime/source-requests";
import type { CreateDisputeRecoveryScenarioHarness } from "./harness";

export function registerWonDisputeRecoveryScenario(createHarness: CreateDisputeRecoveryScenarioHarness): void {
    test("releases one exact platform-balance recovery after a reversed dispute is won", async () => {
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
                clientReferenceId: "order-dispute-recovery-release",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-before-recovery-dispute",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        harness.rest.addProviderDispute("ch_1", {
            id: "dp_recovery_release",
            status: "needs_response",
        });
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "recovery-dispute-open",
                limit: 25,
            }),
        );
        harness.rest.updateProviderDispute("dp_recovery_release", { status: "won" });
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "recovery-dispute-won",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            outstanding_debt_amount: 0,
            financial_exposure_amount: 0,
            payout_schedule: "daily",
            manual_payout_hold_started_at: null,
            manual_payout_hold_alert_at: null,
            manual_payout_hold_deadline_at: null,
            manual_payout_hold_restore_settings: null,
        });

        const recoveryBody = {
            paymentId: created.paymentId,
            releaseAuthorizationId: "release-recovery-after-won",
            releaseKind: "recovery",
            amount: 1080,
            currency: "eur",
        };
        const recovery = await okJson(await sourceJson(harness, "requestSettlementRelease", recoveryBody));
        const repeated = await okJson(await sourceJson(harness, "requestSettlementRelease", recoveryBody));
        const payment = harness.rest.rows("payments")[0];

        expect(recovery).toMatchObject({
            releaseAuthorizationId: "release-recovery-after-won",
            releaseKind: "recovery",
            amount: 1080,
            status: "succeeded",
        });
        expect(repeated).toMatchObject({ stripeTransferId: recovery.stripeTransferId });
        expect(harness.rest.lastTransferParameters).toMatchObject({
            amount: "1080",
            "metadata[cms_release_authorization_id]": "release-recovery-after-won",
            "metadata[cms_release_kind]": "recovery",
        });
        expect(harness.rest.lastTransferParameters).not.toHaveProperty("source_transaction");
        expect(payment).toMatchObject({
            dispute_status: "won",
            settlement_status: "released",
            transferred_amount: 2160,
            reversed_amount: 1080,
        });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "reversal", "transfer"]);
    });
}
