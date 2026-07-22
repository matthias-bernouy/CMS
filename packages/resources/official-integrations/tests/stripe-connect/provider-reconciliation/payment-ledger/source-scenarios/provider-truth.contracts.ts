import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../runtime/constants";
import { okJson } from "../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../runtime/source-requests";
import type { CreatePaymentRecoveryScenarioHarness } from "./harness";

export function registerProviderTruthHydrationScenarios(createHarness: CreatePaymentRecoveryScenarioHarness): void {
    test("retrieves and validates Charge and BalanceTransaction references before accepting provider success", async () => {
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
                clientReferenceId: "provider-reference-hydration",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        harness.rest.setPaymentIntentProviderReferences(paymentIntentId);

        const synced = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(synced).toMatchObject({
            paymentStatus: "succeeded",
            commercePaymentStatus: "succeeded",
            settlementStatus: "held",
            stripeChargeId: "ch_1",
            stripeChargeBalanceTransactionId: "txn_charge_1",
            actualStripeChargeFeeAmount: 65,
        });
        expect(harness.rest.chargeRetrieveCount).toBe(1);
        expect(harness.rest.balanceTransactionRetrieveCount).toBe(1);
        expect(harness.rest.rows("provider_exceptions")).toHaveLength(0);
    });

    test("never trusts a separately retrieved BalanceTransaction without validating immutable payment truth", async () => {
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
                clientReferenceId: "invalid-retrieved-balance-transaction",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        harness.rest.setPaymentIntentProviderReferences(paymentIntentId);
        harness.rest.patchProviderBalanceTransaction(paymentIntentId, { amount: 1199, net: 1134 });

        const synced = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(synced).toMatchObject({
            paymentStatus: "failed",
            commercePaymentStatus: "manual_review",
            settlementStatus: "manual_review",
        });
        expect(harness.rest.balanceTransactionRetrieveCount).toBe(1);
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                payment_id: created.paymentId,
                exception_type: "provider_payment_truth_mismatch",
                status: "open",
            }),
        );
    });
}
