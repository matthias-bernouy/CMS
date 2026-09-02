import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../../../runtime/constants";
import { okJson } from "../../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../../runtime/source-requests";
import {
    createPaidPaymentWithReleases as createPaidPaymentWithReleasesBase,
    type CreateProtectedRefundSourceHarness,
} from "../harness";

export function registerTransferRecoveryDisputeScenarios(createHarness: CreateProtectedRefundSourceHarness): void {
    const createPaidPaymentWithReleases = (
        clientReferenceId: string,
        releases: Array<{ id: string; kind: "initial" | "reserve"; amount: number }>,
    ) => createPaidPaymentWithReleasesBase(createHarness, clientReferenceId, releases);

    test("reverses both initial and reserve Transfers for one chargeback", async () => {
        const { harness } = await createPaidPaymentWithReleases("order-two-transfer-chargeback", [
            { id: "release-initial-chargeback", kind: "initial", amount: 900 },
            { id: "release-reserve-chargeback", kind: "reserve", amount: 180 },
        ]);
        harness.rest.addProviderDispute("ch_1", {
            id: "dp_two_transfer_chargeback",
            amount: 1200,
            status: "needs_response",
        });

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "two-transfer-chargeback",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("transfer_recovery_requests")[0]).toMatchObject({
            exposure_type: "chargeback",
            requested_amount: 1080,
            confirmed_amount: 1080,
            status: "succeeded",
        });
        expect(harness.rest.rows("transfer_reversals").map((row) => row.amount)).toEqual([180, 900]);
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "transfer", "reversal", "reversal"]);
        expect(harness.rest.rows("refunds")).toHaveLength(0);
    });

    test("still attempts seller recovery when the provider payout hold is unavailable", async () => {
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
                clientReferenceId: "order-hold-outage",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-hold-outage",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        harness.rest.rejectBalanceSettingsUpdates();

        const refunded = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-hold-outage",
                commerceRefundRequestId: 79,
                amount: 1200,
                authorizedSellerAmount: 0,
                sellerEntitlementReductionAmount: 1080,
                reason: "buyer remedy during provider payout outage",
            }),
        );

        expect(refunded.reversal).toMatchObject({
            status: "succeeded",
            confirmedAmount: 1080,
            reversals: [{ status: "succeeded", stripeTransferReversalId: "trr_1", amount: 1080 }],
        });
        expect(refunded.refund).toMatchObject({ status: "succeeded", stripeRefundId: "re_1" });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "reversal", "refund"]);
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "seller_payout_hold_failed",
                severity: "critical",
            }),
        );
    });
}
