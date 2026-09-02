import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../../runtime/constants";
import { jsonBody, okJson } from "../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../runtime/source-requests";
import type { CreateDisputeRecoveryScenarioHarness } from "./harness";

export function registerPreTransferDisputeScenarios(createHarness: CreateDisputeRecoveryScenarioHarness): void {
    test("releases after Stripe closes a dispute without loss", async () => {
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
                clientReferenceId: "order-won-dispute-release",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        harness.rest.addProviderDispute("ch_1", { id: "dp_won_before_release", status: "won" });

        const release = await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-after-won-dispute",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        const payment = harness.rest.rows("payments")[0];

        expect(release).toMatchObject({ amount: 1080, status: "succeeded" });
        expect(payment).toMatchObject({ dispute_status: "won", settlement_status: "released" });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer"]);
    });

    test("blocks a refund when a seller Transfer becomes in flight after provider reconciliation", async () => {
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
                clientReferenceId: "order-transfer-races-refund",
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
        harness.rest.injectInFlightTransferBeforeNextRefundReservation(Number(created.paymentId), 500);

        const response = await sourceJson(harness, "requestProtectedRefund", {
            paymentId: created.paymentId,
            refundRequestId: "refund-raced-by-transfer",
            commerceRefundRequestId: 81,
            amount: 1200,
            authorizedSellerAmount: 0,
            sellerEntitlementReductionAmount: 1080,
            reason: "full refund must observe concurrent Transfer",
        });

        expect(response.status).toBe(409);
        expect(await jsonBody(response)).toEqual({
            error: "required Transfer Reversal is not confirmed or a Transfer is in flight",
        });
        expect(harness.rest.rows("refunds")).toHaveLength(0);
        expect(harness.rest.moneyCallOrder).toEqual([]);
        expect(harness.rest.rows("transfers")[0]).toMatchObject({ status: "processing", amount: 500 });
    });
}
