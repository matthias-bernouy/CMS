import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../../runtime/constants";
import { okJson } from "../../../../runtime/http";
import { same } from "../../../../runtime/records";
import { sourceJson, sourceRequest } from "../../../../runtime/source-requests";
import type { JsonRecord } from "../../../../runtime/types";
import type { CreateProtectedRefundSourceHarness } from "./harness";

export function registerSettlementRefundScenario(createHarness: CreateProtectedRefundSourceHarness): void {
    test("releases with source_transaction and reverses before a protected refund", async () => {
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
                clientReferenceId: "order-release-1",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        const paid = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );
        expect(paid).toMatchObject({
            paymentStatus: "succeeded",
            stripeChargeId: "ch_1",
            stripeChargeBalanceTransactionId: "txn_charge_1",
            actualStripeChargeFeeAmount: 65,
            actualStripeRefundFeeAmount: 0,
            actualStripeProcessingFeeAmount: 65,
            actualStripeChargeNetAmount: 1135,
            actualStripeFeeCurrency: "eur",
            actualPlatformMarginAfterStripeAmount: 55,
        });

        const transfer = await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-order-1",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        expect(transfer).toMatchObject({
            stripeTransferId: "tr_1",
            sourceChargeId: "ch_1",
            destinationAccountId: "acct_seller_example_com",
            status: "succeeded",
        });
        expect(harness.rest.lastTransferParameters).toMatchObject({
            source_transaction: "ch_1",
            transfer_group: String(created.transferGroup),
            destination: "acct_seller_example_com",
            amount: "1080",
        });

        const protectedRefund = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-order-1",
                commerceRefundRequestId: 77,
                amount: 1200,
                authorizedSellerAmount: 0,
                sellerEntitlementReductionAmount: 1080,
                reason: "resolved buyer claim",
            }),
        );
        expect(protectedRefund.reversal).toMatchObject({
            status: "succeeded",
            confirmedAmount: 1080,
            reversals: [{ status: "succeeded", stripeTransferReversalId: "trr_1", amount: 1080 }],
        });
        expect(protectedRefund.refund).toMatchObject({
            status: "succeeded",
            stripeRefundId: "re_1",
            stripeBalanceTransactionId: "txn_refund_1",
            actualStripeFeeAmount: 0,
            actualStripeNetAmount: -1200,
            actualStripeFeeCurrency: "eur",
        });
        expect(protectedRefund.operations).toMatchObject([
            { operationType: "reversal", status: "succeeded", amount: 1080 },
            { operationType: "refund", status: "succeeded", amount: 1200, commerceRefundRequestId: 77 },
        ]);
        const riskAfterRecovery = await okJson(
            await sourceRequest(harness, "getSellerProviderRisk", {
                userId: "seller-1",
            }),
        );
        expect(riskAfterRecovery).toMatchObject({
            account: { payoutSchedule: "manual", outstandingDebtAmount: 0, financialExposureAmount: 0 },
            payoutControl: { interval: "manual", minimumBalanceByCurrency: { eur: 1080 } },
        });
        const operations = await okJson(await sourceRequest(harness, "listFinancialOperations"));
        expect(operations.operations).toContainEqual(
            expect.objectContaining({
                operationType: "refund_create",
                amount: 1200,
                currency: "eur",
                refundRequestId: "refund-order-1",
                commerceRefundRequestId: 77,
            }),
        );
        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "financial-operation-projection",
            }),
        );
        expect(reconciliation.commerceOperations).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ operationType: "transfer", orderPublicId: "order-release-1", amount: 1080 }),
                expect.objectContaining({ operationType: "reversal", orderPublicId: "order-release-1", amount: 1080 }),
            ]),
        );
        expect(reconciliation.commerceOperations).not.toContainEqual(
            expect.objectContaining({ operationType: "refund" }),
        );
        const transferProjection = (reconciliation.commerceOperations as JsonRecord[]).find(
            (operation) => operation.operationType === "transfer",
        )!;
        expect(Object.hasOwn(transferProjection, "commerceRefundRequestId")).toBe(false);
        expect(Object.hasOwn(transferProjection, "refundRequestId")).toBe(false);
        for (const projection of reconciliation.commerceOperations as JsonRecord[]) {
            const outbox = harness.rest
                .rows("commerce_projection_outbox")
                .find((row) => same(row.id, projection.projectionId));
            expect(projection.providerEventId).toBe(outbox?.projection_key);
            await okJson(
                await sourceJson(harness, "acknowledgeCommerceProjection", {
                    projectionId: projection.projectionId,
                    claimToken: projection.projectionClaimToken,
                }),
            );
        }
        const afterReversals = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "financial-operation-projection-after-reversals",
            }),
        );
        expect(afterReversals.commerceOperations).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    operationType: "refund",
                    orderPublicId: "order-release-1",
                    refundRequestId: "refund-order-1",
                    commerceRefundRequestId: 77,
                    amount: 1200,
                }),
            ]),
        );
        const refundProjection = (afterReversals.commerceOperations as JsonRecord[]).find(
            (operation) => operation.operationType === "refund",
        )!;
        const refundOutbox = harness.rest
            .rows("commerce_projection_outbox")
            .find((row) => same(row.id, refundProjection.projectionId));
        expect(refundProjection.providerEventId).toBe(refundOutbox?.projection_key);
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "reversal", "refund"]);
    });
}
