import { expect, test } from "bun:test";
import { financialTermsHash, functionsBaseUrl } from "../../../../../runtime/constants";
import { okJson, stripeSignature } from "../../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../../runtime/source-requests";
import type { JsonRecord } from "../../../../../runtime/types";
import type { CreateProtectedRefundSourceHarness } from "../harness";

export function registerPendingRefundScenario(createHarness: CreateProtectedRefundSourceHarness): void {
    test("projects a pending refund before its exact succeeded provider transition", async () => {
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
                clientReferenceId: "order-pending-refund-success",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        harness.rest.setNextRefundStatus("pending");

        const requested = await okJson(
            await sourceJson(harness, "requestProtectedRefund", {
                paymentId: created.paymentId,
                refundRequestId: "refund-pending-success",
                commerceRefundRequestId: 901,
                amount: 300,
                authorizedSellerAmount: 780,
                sellerEntitlementReductionAmount: 300,
                reason: "pending provider refund",
            }),
        );
        expect(requested.refund).toMatchObject({ status: "pending", stripeRefundId: "re_1" });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                operation_type: "refund_create",
                status: "processing",
            }),
        );

        const pendingRun = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "pending-refund-projection",
                limit: 25,
            }),
        );
        const pendingProjection = (pendingRun.commerceOperations as JsonRecord[]).find(
            (operation) => operation.refundRequestId === "refund-pending-success",
        )!;
        expect(pendingProjection).toMatchObject({ operationType: "refund", status: "pending" });
        await okJson(
            await sourceJson(harness, "acknowledgeCommerceProjection", {
                projectionId: pendingProjection.projectionId,
                claimToken: pendingProjection.projectionClaimToken,
            }),
        );

        harness.rest.updateProviderRefund("re_1", { status: "succeeded" });
        const succeededRun = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "pending-refund-provider-reconciled",
                limit: 25,
            }),
        );
        const succeededProjection = (succeededRun.commerceOperations as JsonRecord[]).find(
            (operation) => operation.refundRequestId === "refund-pending-success",
        )!;
        expect(succeededProjection).toMatchObject({ operationType: "refund", status: "succeeded" });
        expect(harness.rest.rows("refunds")[0]).toMatchObject({ status: "succeeded" });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                operation_type: "refund_create",
                status: "succeeded",
            }),
        );

        harness.rest.updateProviderRefund("re_1", { status: "pending" });
        const stalePayload = JSON.stringify({
            id: "evt_stale_pending_refund_1",
            type: "refund.updated",
            api_version: "2026-02-25.clover",
            created: Math.floor(Date.now() / 1000) - 60,
            livemode: false,
            data: { object: { id: "re_1" } },
        });
        const staleSignature = await stripeSignature(stalePayload, "whsec_test_123");
        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": staleSignature },
                body: stalePayload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "pending-refund-stale-event",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("refunds")[0]).toMatchObject({ status: "succeeded" });
        expect(
            harness.rest
                .rows("commerce_projection_outbox")
                .filter((row) => String(row.projection_key).startsWith("refund:")),
        ).toHaveLength(2);
    });
}
