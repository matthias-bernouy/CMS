import { expect, test } from "bun:test";
import { financialTermsHash, functionsBaseUrl } from "../../runtime/constants";
import type { StripeConnectHarness } from "../../runtime/harness";
import { okJson, stripeSignature } from "../../runtime/http";
import { sourceJson } from "../../runtime/source-requests";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerPaymentCancellationSourceScenarios(createHarness: CreateHarness): void {
    test("cancels a reconfirmable PaymentIntent idempotently before Commerce can restore inventory", async () => {
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
                clientReferenceId: "cancel-during-confirmation",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );

        const first = await okJson(
            await sourceJson(harness, "cancelProtectedPayment", {
                clientReferenceId: "cancel-during-confirmation",
                cancellationRequestId: "commerce-cancellation-1",
                reason: "buyer cancelled during confirmation",
            }),
        );
        const replay = await okJson(
            await sourceJson(harness, "cancelProtectedPayment", {
                clientReferenceId: "cancel-during-confirmation",
                cancellationRequestId: "commerce-cancellation-1",
                reason: "buyer cancelled during confirmation",
            }),
        );

        expect(first).toMatchObject({
            cancellationRequestId: "commerce-cancellation-1",
            providerStatus: "canceled",
            payment: { paymentId: created.paymentId, paymentStatus: "cancelled" },
        });
        expect(replay).toMatchObject({ providerOperationId: first.providerOperationId, providerStatus: "canceled" });
        expect(
            harness.rest.rows("financial_operations").filter((row) => row.operation_type === "payment_intent_cancel"),
        ).toEqual([expect.objectContaining({ status: "succeeded", stripe_object_id: created.stripePaymentIntentId })]);
    });

    test("recovers a lost PaymentIntent cancellation response without creating a second cancellation", async () => {
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
                clientReferenceId: "lost-cancel-response",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.losePaymentCancellationResponseOnce();
        const lost = await sourceJson(harness, "cancelProtectedPayment", {
            clientReferenceId: "lost-cancel-response",
            cancellationRequestId: "commerce-cancellation-lost-1",
            reason: "deadline elapsed",
        });
        expect(lost.status).toBeGreaterThanOrEqual(500);

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "recover-lost-payment-cancellation",
                limit: 25,
            }),
        );

        expect(reconciliation.payments).toContainEqual(
            expect.objectContaining({
                paymentId: created.paymentId,
                paymentStatus: "cancelled",
            }),
        );
        expect(
            harness.rest.rows("financial_operations").filter((row) => row.operation_type === "payment_intent_cancel"),
        ).toEqual([expect.objectContaining({ status: "succeeded", stripe_object_id: created.stripePaymentIntentId })]);
    });

    test("keeps payment_failed reconfirmable and reports a cancellation race as late success", async () => {
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
                clientReferenceId: "failed-then-reconfirm",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        const paymentIntentId = String(created.stripePaymentIntentId);
        const failedPayload = JSON.stringify({
            id: "evt_reconfirmable_payment_failed",
            type: "payment_intent.payment_failed",
            api_version: "2026-02-25.clover",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: { id: paymentIntentId } },
        });
        const failedSignature = await stripeSignature(failedPayload, "whsec_test_123");
        await harness.edgeRequest(
            new Request(`${functionsBaseUrl}/cms-stripe-connect/webhooks/stripe`, {
                method: "POST",
                headers: { "stripe-signature": failedSignature },
                body: failedPayload,
            }),
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "reconfirmable-payment-failed",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("payments")[0]).toMatchObject({ payment_status: "created" });

        harness.rest.setPaymentIntentSucceeded(paymentIntentId);
        const late = await okJson(
            await sourceJson(harness, "cancelProtectedPayment", {
                clientReferenceId: "failed-then-reconfirm",
                cancellationRequestId: "commerce-cancellation-late-success",
                reason: "buyer cancelled while reconfirming",
            }),
        );
        expect(late).toMatchObject({
            providerStatus: "succeeded",
            payment: { paymentStatus: "succeeded", stripeChargeId: "ch_1" },
        });
        expect(harness.rest.rows("payment_events")).toContainEqual(
            expect.objectContaining({
                event_type: "payment_intent_cancellation_found_late_success",
            }),
        );
    });
}
