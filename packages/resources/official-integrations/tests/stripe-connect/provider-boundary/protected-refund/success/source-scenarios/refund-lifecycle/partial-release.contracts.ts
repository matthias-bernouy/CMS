import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../../../runtime/constants";
import { okJson } from "../../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../../runtime/source-requests";
import type { CreateProtectedRefundSourceHarness } from "../harness";

export function registerPartialRefundReleaseScenario(createHarness: CreateProtectedRefundSourceHarness): void {
    test("releases only the remaining authorized seller amount after a partial refund", async () => {
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
                clientReferenceId: "order-partial-refund-before-release",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));

        const partialRefund = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-partial-before-release",
                commerceRefundRequestId: 79,
                amount: 400,
                authorizedSellerAmount: 780,
                sellerEntitlementReductionAmount: 300,
                reason: "partial buyer remedy",
            }),
        );
        const release = await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-after-partial-refund",
                releaseKind: "initial",
                amount: 780,
                currency: "eur",
            }),
        );
        const payment = harness.rest.rows("payments")[0];

        expect(partialRefund).toMatchObject({
            reversal: null,
            refund: {
                amount: 400,
                requiredReversalAmount: 0,
                sellerEntitlementReductionAmount: 300,
                authorizedSellerAmount: 780,
                status: "succeeded",
            },
        });
        expect(release).toMatchObject({ amount: 780, status: "succeeded" });
        expect(payment).toMatchObject({
            refunded_amount: 400,
            transferred_amount: 780,
            reversed_amount: 0,
            settlement_status: "released",
        });
        expect(harness.rest.lastTransferParameters).toMatchObject({ amount: "780" });
        expect(harness.rest.moneyCallOrder).toEqual(["refund", "transfer"]);

        const secondRefund = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-partial-after-release",
                commerceRefundRequestId: 80,
                amount: 200,
                authorizedSellerAmount: 580,
                sellerEntitlementReductionAmount: 200,
                reason: "second partial buyer remedy",
            }),
        );
        expect(secondRefund).toMatchObject({
            reversal: {
                requestedAmount: 200,
                confirmedAmount: 200,
                reversals: [{ amount: 200, status: "succeeded" }],
            },
            refund: {
                amount: 200,
                requiredReversalAmount: 200,
                sellerEntitlementReductionAmount: 200,
                authorizedSellerAmount: 580,
                status: "succeeded",
            },
        });
        expect(harness.rest.moneyCallOrder).toEqual(["refund", "transfer", "reversal", "refund"]);
    });
}
