import { expect, test } from "bun:test";
import { financialTermsHash } from "../../../../runtime/constants";
import type { StripeConnectHarness } from "../../../../runtime/harness";
import { okJson } from "../../../../runtime/http";
import { sourceJson } from "../../../../runtime/source-requests";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerPlatformMinimumSourceScenarios(createHarness: CreateHarness): void {
    test("rejects a manual platform schedule even when the liability minimum is retained", async () => {
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
        const command = {
            platformPayoutControlChangeId: "platform-risk-policy-1",
            minimumBalanceEur: 5000,
            liabilityRevision: 1,
            debitNegativeBalances: true,
            reason: "Protected C2C platform reserve",
        };
        await okJson(await sourceJson(harness, "configurePlatformPayoutControls", command));
        harness.rest.setPlatformPayoutInterval("manual");
        const blocked = await sourceJson(harness, "createProtectedPayment", {
            sellerUserId: "seller-1",
            amountTotal: 1200,
            sellerTransferAmount: 1080,
            currency: "eur",
            clientReferenceId: "unsafe-platform-payout-order",
            financialTermsHash,
            dualApprovalThresholdAmount: 1000,
        });
        expect(blocked.status).toBe(503);

        const configured = await okJson(await sourceJson(harness, "configurePlatformPayoutControls", command));
        expect(configured).toMatchObject({
            platformPayoutControlChangeId: "platform-risk-policy-1",
            payoutControl: { interval: "daily", minimumBalanceByCurrency: { eur: 5000 } },
        });
        const created = await okJson(
            await sourceJson(harness, "createProtectedPayment", {
                sellerUserId: "seller-1",
                amountTotal: 1200,
                sellerTransferAmount: 1080,
                currency: "eur",
                clientReferenceId: "protected-platform-payout-order",
                financialTermsHash,
                dualApprovalThresholdAmount: 1000,
            }),
        );
        expect(created.paymentStatus).toBe("created");
    });

    test("accepts Stripe omitting the platform zero payout minimum", async () => {
        const harness = await createHarness();

        const configured = await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-zero-minimum-canonicalized-by-stripe",
                minimumBalanceEur: 0,
                liabilityRevision: 1,
                debitNegativeBalances: false,
            }),
        );

        expect(configured).toMatchObject({
            appliedMinimumBalanceEur: 0,
            payoutControl: {
                interval: "daily",
                minimumBalanceByCurrency: {},
                debitNegativeBalances: false,
            },
        });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                operation_type: "payout_schedule_update",
                status: "succeeded",
            }),
        );
    });
}
