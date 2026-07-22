import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../../../runtime/constants";
import { okJson } from "../../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../../runtime/source-requests";
import type { CreateProtectedRefundSourceHarness } from "../harness";

export function registerNonterminalRefundScenario(createHarness: CreateProtectedRefundSourceHarness): void {
    test("keeps one nonterminal refund per payment and releases the reservation after failure", async () => {
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
                clientReferenceId: "order-pending-refund-failure",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        harness.rest.setNextRefundStatus("pending");
        const firstBody = {
            paymentId: created.paymentId,
            refundRequestId: "refund-pending-failure",
            commerceRefundRequestId: 902,
            amount: 300,
            authorizedSellerAmount: 780,
            sellerEntitlementReductionAmount: 300,
            reason: "first pending refund",
        };
        await okJson(await sourceJson(harness, "requestProtectedRefund", firstBody));

        const second = await sourceJson(harness, "requestProtectedRefund", {
            ...firstBody,
            refundRequestId: "refund-must-wait",
            commerceRefundRequestId: 903,
            authorizedSellerAmount: 480,
        });
        expect(second.status).toBe(409);
        expect(harness.rest.moneyCallOrder.filter((call) => call === "refund")).toHaveLength(1);

        harness.rest.updateProviderRefund("re_1", { status: "failed", failure_reason: "provider_declined" });
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "pending-refund-provider-failed",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("refunds")[0]).toMatchObject({ status: "failed" });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                operation_type: "refund_create",
                status: "failed",
            }),
        );
        expect(harness.rest.rows("commerce_projection_outbox")).toContainEqual(
            expect.objectContaining({
                projection_key: expect.stringContaining(":failed"),
                projection_payload: expect.objectContaining({ status: "failed" }),
            }),
        );
    });
}
