import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../../runtime/constants";
import { okJson } from "../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../runtime/source-requests";
import type { CreateProtectedRefundSourceHarness } from "./harness";

export function registerRefundFeeAccountingScenario(createHarness: CreateProtectedRefundSourceHarness): void {
    test("accounts for signed Stripe refund fee credits exactly once", async () => {
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
                clientReferenceId: "refund-fee-credit",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        harness.rest.setNextRefundFee(-20);

        const first = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-fee-credit-1",
                commerceRefundRequestId: 701,
                amount: 100,
                authorizedSellerAmount: 980,
                sellerEntitlementReductionAmount: 100,
                reason: "partial buyer remedy",
            }),
        );
        const replay = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-fee-credit-1",
                commerceRefundRequestId: 701,
                amount: 100,
                authorizedSellerAmount: 980,
                sellerEntitlementReductionAmount: 100,
                reason: "partial buyer remedy",
            }),
        );
        const payment = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(harness.rest.rows("refunds")[0]).toMatchObject({
            stripe_balance_transaction_id: "txn_refund_1",
            actual_stripe_fee_amount: -20,
            actual_stripe_net_amount: -80,
        });
        expect(first.refund).toMatchObject({
            stripeBalanceTransactionId: "txn_refund_1",
            actualStripeFeeAmount: -20,
            actualStripeNetAmount: -80,
        });
        expect(replay.refund).toMatchObject({
            refundId: first.refund.refundId,
            actualStripeFeeAmount: -20,
        });
        expect(payment).toMatchObject({
            actualStripeChargeFeeAmount: 65,
            actualStripeRefundFeeAmount: -20,
            actualStripeProcessingFeeAmount: 45,
            actualPlatformMarginAfterStripeAmount: 75,
        });
        expect(harness.rest.rows("refunds")).toHaveLength(1);
    });
}
