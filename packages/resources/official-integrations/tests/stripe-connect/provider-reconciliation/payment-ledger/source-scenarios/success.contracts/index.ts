import { expect, test } from "bun:test";
import { financialTermsHash, isoTimestampPattern } from "../../../../runtime/constants";
import { okJson } from "../../../../runtime/http";
import { sourceJson } from "../../../../runtime/source-requests";
import type { JsonRecord } from "../../../../runtime/types";
import type { CreatePaymentRecoveryScenarioHarness } from "../harness";
import { expectedLostPaymentReconciliation } from "./expected-reconciliation";
import { expectedLostPaymentStripeRequests } from "./expected-requests";

export function registerLostPaymentRecoveryScenario(createHarness: CreatePaymentRecoveryScenarioHarness): void {
    test("reconciles a succeeded PaymentIntent when its webhook was lost", async () => {
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
                clientReferenceId: "lost-payment-webhook-order",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        harness.rest.clearStripeRequests();

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "lost-payment-webhook-reconciliation",
                limit: 25,
            }),
        );
        const payments = reconciliation.payments as JsonRecord[];
        const operations = reconciliation.operations as JsonRecord[];
        expect(reconciliation.finishedAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(payments[0]?.paidAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(payments[0]?.lastProviderSyncAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(payments[1]?.paidAt).toBe(payments[0]?.paidAt);
        expect(payments[1]?.lastProviderSyncAt).toBe(payments[0]?.lastProviderSyncAt);
        expect(operations[0]?.claimedAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(operations[0]?.completedAt).toEqual(expect.stringMatching(isoTimestampPattern));
        expect(reconciliation).toEqual(expectedLostPaymentReconciliation(reconciliation));
        expect(harness.rest.rows("payments")[0]).toMatchObject({
            stripe_charge_balance_transaction_id: "txn_charge_1",
            actual_stripe_charge_fee_amount: 65,
            actual_stripe_refund_fee_amount: 0,
            actual_stripe_processing_fee_amount: 65,
        });
        expect(harness.rest.stripeRequests).toEqual(expectedLostPaymentStripeRequests);
    });
}
