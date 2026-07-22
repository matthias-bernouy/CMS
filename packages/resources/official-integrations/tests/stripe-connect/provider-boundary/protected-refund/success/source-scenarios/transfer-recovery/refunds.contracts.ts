import { expect, test } from "bun:test";
import { okJson } from "../../../../../runtime/http";
import { sourceJson } from "../../../../../runtime/source-requests";
import {
    createPaidPaymentWithReleases as createPaidPaymentWithReleasesBase,
    type CreateProtectedRefundSourceHarness,
} from "../harness";

export function registerTransferRecoveryRefundScenarios(createHarness: CreateProtectedRefundSourceHarness): void {
    const createPaidPaymentWithReleases = (
        clientReferenceId: string,
        releases: Array<{ id: string; kind: "initial" | "reserve"; amount: number }>,
    ) => createPaidPaymentWithReleasesBase(createHarness, clientReferenceId, releases);

    test("reverses initial and reserve Transfers before one full protected refund", async () => {
        const { harness, created } = await createPaidPaymentWithReleases("order-two-transfer-refund", [
            { id: "release-initial-split", kind: "initial", amount: 900 },
            { id: "release-reserve-split", kind: "reserve", amount: 180 },
        ]);

        const result = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-two-transfer-full",
                commerceRefundRequestId: 801,
                amount: 1200,
                authorizedSellerAmount: 0,
                sellerEntitlementReductionAmount: 1080,
                reason: "full buyer remedy",
            }),
        );

        expect(result.reversal).toMatchObject({
            status: "succeeded",
            requestedAmount: 1080,
            confirmedAmount: 1080,
            allocationShortfallAmount: 0,
            reversals: [
                { amount: 180, stripeTransferReversalId: "trr_1", status: "succeeded" },
                { amount: 900, stripeTransferReversalId: "trr_2", status: "succeeded" },
            ],
        });
        expect(result.operations).toMatchObject([
            { operationType: "reversal", amount: 180, status: "succeeded" },
            { operationType: "reversal", amount: 900, status: "succeeded" },
            { operationType: "refund", amount: 1200, status: "succeeded" },
        ]);
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "transfer", "reversal", "reversal", "refund"]);
    });

    test("allocates a partial seller recovery deterministically across two Transfers", async () => {
        const { harness, created } = await createPaidPaymentWithReleases("order-two-transfer-partial", [
            { id: "release-initial-partial", kind: "initial", amount: 900 },
            { id: "release-reserve-partial", kind: "reserve", amount: 180 },
        ]);

        const result = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-two-transfer-partial",
                commerceRefundRequestId: 802,
                amount: 250,
                authorizedSellerAmount: 830,
                sellerEntitlementReductionAmount: 250,
                reason: "partial buyer remedy",
            }),
        );

        expect(result.reversal).toMatchObject({
            requestedAmount: 250,
            confirmedAmount: 250,
            reversals: [
                { amount: 180, status: "succeeded" },
                { amount: 70, status: "succeeded" },
            ],
        });
        expect(result.operations).toHaveLength(3);
        expect(harness.rest.rows("refunds")[0]).toMatchObject({
            amount: 250,
            required_reversal_amount: 250,
            status: "succeeded",
        });
    });

    test("reconciles a lost second reversal response without duplicating any money movement", async () => {
        const { harness, created } = await createPaidPaymentWithReleases("order-two-transfer-lost-response", [
            { id: "release-initial-lost", kind: "initial", amount: 900 },
            { id: "release-reserve-lost", kind: "reserve", amount: 180 },
        ]);
        harness.rest.loseTransferReversalResponseAfter(1);
        const body = {
            paymentId: created.paymentId,
            refundRequestId: "refund-two-transfer-lost",
            commerceRefundRequestId: 803,
            amount: 1200,
            authorizedSellerAmount: 0,
            sellerEntitlementReductionAmount: 1080,
            reason: "buyer remedy with lost provider response",
        };

        const first = await sourceJson(harness, "requestProtectedRefund", body);
        expect(first.status).toBe(409);
        expect(harness.rest.rows("refunds")).toHaveLength(0);
        expect(harness.rest.rows("transfer_recovery_requests")[0]).toMatchObject({
            status: "manual_review",
            confirmed_amount: 180,
        });

        const retried = await okJson(await sourceJson(harness, "requestProtectedRefund", body));
        expect(retried.reversal).toMatchObject({ status: "succeeded", confirmedAmount: 1080 });
        expect(harness.rest.moneyCallOrder).toEqual(["transfer", "transfer", "reversal", "reversal", "refund"]);
        expect(harness.rest.rows("transfer_reversals")).toHaveLength(2);
        expect(
            harness.rest
                .rows("financial_operations")
                .filter((row) => row.operation_type === "transfer_reversal_create"),
        ).toEqual([
            expect.objectContaining({ status: "succeeded", stripe_object_id: "trr_1" }),
            expect.objectContaining({ status: "succeeded", stripe_object_id: "trr_2" }),
        ]);
    });

    test("records debt and never refunds when confirmed Transfers cannot cover recovery", async () => {
        const { harness, created } = await createPaidPaymentWithReleases("order-recovery-shortfall", [
            { id: "release-shortfall", kind: "initial", amount: 900 },
        ]);
        harness.rest.patchPaymentLedger(Number(created.paymentId), { transferred_amount: 1080 });

        const failed = await sourceJson(harness, "requestTransferReversal", {
            paymentId: created.paymentId,
            reversalRequestId: "manual-recovery-shortfall",
            amount: 1080,
            reason: "shortfall must fail closed",
        });

        expect(failed.status).toBe(409);
        expect(harness.rest.rows("transfer_recovery_requests")[0]).toMatchObject({
            requested_amount: 1080,
            allocated_amount: 900,
            confirmed_amount: 900,
            allocation_shortfall_amount: 180,
            status: "manual_review",
        });
        expect(harness.rest.rows("refunds")).toHaveLength(0);
        expect(harness.rest.rows("seller_recovery_exposures")[0]).toMatchObject({
            status: "debt",
            amount: 1080,
            recovered_amount: 900,
        });
        expect(harness.rest.rows("accounts")[0]).toMatchObject({ outstanding_debt_amount: 180 });
        expect(harness.rest.rows("payments")[0]).toMatchObject({ settlement_status: "manual_review" });
    });
}
