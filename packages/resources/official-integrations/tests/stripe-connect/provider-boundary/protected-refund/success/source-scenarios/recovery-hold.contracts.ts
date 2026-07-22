import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../../runtime/constants";
import { jsonBody, okJson } from "../../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../../runtime/source-requests";
import type { CreateProtectedRefundSourceHarness } from "./harness";

export function registerRefundRecoveryHoldScenario(createHarness: CreateProtectedRefundSourceHarness): void {
    test("blocks the seller and enforces a provider payout hold when recovery is impossible", async () => {
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
                clientReferenceId: "order-debt-1",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        harness.rest.setPaymentIntentSucceeded(String(created.stripePaymentIntentId));
        await okJson(await sourceRequest(harness, "getProtectedPayment", { paymentId: String(created.paymentId) }));
        await okJson(
            await sourceJson(harness, "requestSettlementRelease", {
                paymentId: created.paymentId,
                releaseAuthorizationId: "release-debt-1",
                releaseKind: "initial",
                amount: 1080,
                currency: "eur",
            }),
        );
        harness.rest.rejectTransferReversals();

        const failed = await sourceJson(harness, "requestProtectedRefund", {
            paymentId: created.paymentId,
            refundRequestId: "refund-debt-1",
            commerceRefundRequestId: 78,
            amount: 1200,
            authorizedSellerAmount: 0,
            sellerEntitlementReductionAmount: 1080,
            reason: "late buyer remedy",
        });
        expect(failed.status).toBe(409);
        expect(await jsonBody(failed)).toEqual({ error: "seller recovery failed; refund requires finance review" });
        const account = harness.rest.rows("accounts")[0];
        expect(account).toMatchObject({
            risk_status: "blocked",
            payout_schedule: "manual",
            outstanding_debt_amount: 1080,
            financial_exposure_amount: 0,
        });
        expect(
            Date.parse(String(account.manual_payout_hold_alert_at)) -
                Date.parse(String(account.manual_payout_hold_started_at)),
        ).toBe(75 * 24 * 60 * 60 * 1000);
        expect(
            Date.parse(String(account.manual_payout_hold_deadline_at)) -
                Date.parse(String(account.manual_payout_hold_started_at)),
        ).toBe(90 * 24 * 60 * 60 * 1000);
        expect(harness.rest.rows("seller_recovery_exposures")).toContainEqual(
            expect.objectContaining({
                recovery_key: "refund-debt-1:seller-recovery",
                status: "debt",
                amount: 1080,
            }),
        );
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "seller_recovery_debt",
                severity: "critical",
            }),
        );

        const unsafePayout = await sourceJson(harness, "configureSellerPayoutSchedule", {
            userId: "seller-1",
            payoutScheduleChangeId: "unsafe-after-debt",
            interval: "weekly",
            weeklyPayoutDays: ["monday"],
            minimumBalanceEur: 1080,
        });
        expect(unsafePayout.status).toBe(409);

        harness.rest.setManualPayoutHoldWindow(
            "seller-1",
            "2026-01-01T00:00:00.000Z",
            "2026-01-02T00:00:00.000Z",
            "2099-01-01T00:00:00.000Z",
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-manual-hold-alert",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "seller_manual_payout_hold_deadline_approaching",
                severity: "high",
            }),
        );

        harness.rest.setManualPayoutHoldWindow(
            "seller-1",
            "2025-01-01T00:00:00.000Z",
            "2025-03-17T00:00:00.000Z",
            "2025-04-01T00:00:00.000Z",
        );
        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-manual-hold-deadline",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            risk_status: "manual_review",
            financial_hold_reason: "Emergency seller payout hold exceeded the French 90-day deadline",
        });
        expect(harness.rest.rows("provider_exceptions")).toContainEqual(
            expect.objectContaining({
                exception_type: "seller_manual_payout_hold_deadline_exceeded",
                severity: "critical",
            }),
        );
    });
}
