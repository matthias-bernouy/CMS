import { expect, test } from "bun:test";
import { financialTermsHash, functionsBaseUrl } from "../../../../runtime/constants";
import { okJson, stripeSignature } from "../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../runtime/source-requests";
import type { CreateDisputeRecoveryScenarioHarness } from "./harness";

export function registerDisputeFundsWithdrawalScenario(createHarness: CreateDisputeRecoveryScenarioHarness): void {
    test("keeps a won dispute blocked while withdrawn funds are not reinstated", async () => {
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
                clientReferenceId: "order-won-but-funds-withdrawn",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-before-funds-withdrawn",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        harness.rest.rejectTransferReversals();
        harness.rest.addProviderDispute("ch_1", { id: "dp_won_funds_withdrawn", status: "won" });
        const payload = JSON.stringify({
            id: "evt_dispute_funds_withdrawn",
            type: "charge.dispute.funds_withdrawn",
            api_version: "2026-02-25.clover",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: { id: "dp_won_funds_withdrawn" } },
        });
        const signature = await stripeSignature(payload, "whsec_test_123");
        const ingestion = await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": signature },
                body: payload,
            }),
        );
        expect(ingestion.status).toBe(202);

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "won-dispute-without-funds-reinstated",
                limit: 25,
            }),
        );
        const payment = harness.rest.rows("payments")[0];
        const dispute = harness.rest.rows("stripe_disputes")[0];
        const exposure = harness.rest.rows("seller_recovery_exposures")[0];

        expect(payment).toMatchObject({
            dispute_status: "open",
            settlement_status: "manual_review",
        });
        expect(dispute).toMatchObject({ status: "won", funds_withdrawn: true });
        expect(exposure).toMatchObject({ status: "debt", amount: 1080, recovered_amount: 0 });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "reversal"]);
    });
}
