import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../../../runtime/constants";
import { jsonBody, okJson } from "../../../../../runtime/http";
import { same } from "../../../../../runtime/records";
import { sourceJson, sourceRequest } from "../../../../../runtime/source-requests";
import type { JsonRecord } from "../../../../../runtime/types";
import type { CreateDisputeRecoveryScenarioHarness } from "../harness";

export function registerDisputeReleaseSafeguardScenarios(createHarness: CreateDisputeRecoveryScenarioHarness): void {
    test("blocks the same release call when reconciliation finds arithmetic divergence", async () => {
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
                clientReferenceId: "order-arithmetic-divergence",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        harness.rest.seedSucceededTransfer(created.paymentId, 1200);

        const release = await sourceJson(harness, "requestSettlementRelease", {
            paymentId: created.paymentId,
            releaseAuthorizationId: "release-must-not-continue-after-divergence",
            releaseKind: "initial",
            amount: 1,
            currency: "eur",
        });
        const payment = harness.rest.rows("payments")[0];

        expect(release.status).toBe(409);
        expect(await jsonBody(release)).toEqual({
            error: "provider ledger arithmetic divergence requires finance review",
        });
        expect(payment).toMatchObject({
            settlement_status: "manual_review",
            manual_review_reason: "provider ledger arithmetic divergence",
        });
        expect(harness.rest.moneyCallOrder).toEqual([]);
    });

    test("blocks release when provider reconciliation discovers a missing dispute webhook", async () => {
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
                clientReferenceId: "order-missing-dispute-webhook",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );
        harness.rest.addProviderDispute("ch_1");

        const release = await sourceJson(harness, "requestSettlementRelease", {
            paymentId: created.paymentId,
            releaseAuthorizationId: "release-missing-dispute-webhook",
            releaseKind: "initial",
            amount: 1080,
            currency: "eur",
        });
        const payment = await okJson(
            await sourceRequest(harness, "getProtectedPayment", {
                paymentId: String(created.paymentId),
            }),
        );

        expect(release.status).toBe(409);
        expect(await jsonBody(release)).toEqual({
            error: "payment is blocked by an open, lost, or unresolved Stripe dispute",
        });
        expect(payment).toMatchObject({ disputeStatus: "open", settlementStatus: "blocked" });
        expect(harness.rest.moneyCallOrder).toEqual([]);
        const projectionRun = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "missing-dispute-webhook-projection",
                limit: 25,
            }),
        );
        expect(projectionRun.disputes).toContainEqual(
            expect.objectContaining({
                status: "needs_response",
                clientReferenceId: "order-missing-dispute-webhook",
                providerEventId: expect.stringContaining("dispute:"),
                projectionClaimToken: expect.stringContaining("claim-"),
            }),
        );
        const disputeProjection = (projectionRun.disputes as JsonRecord[]).find((dispute) => dispute.id === "dp_1")!;
        const disputeOutbox = harness.rest
            .rows("commerce_projection_outbox")
            .find((row) => same(row.id, disputeProjection.projectionId));
        expect(disputeProjection.providerEventId).toBe(disputeOutbox?.projection_key);
    });
}
