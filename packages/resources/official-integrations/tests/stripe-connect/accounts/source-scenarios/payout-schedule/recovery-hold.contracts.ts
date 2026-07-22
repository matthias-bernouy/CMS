import { expect, test } from "bun:test";
import { okJson } from "../../../runtime/http";
import { sourceJson, sourceRequestWithUser } from "../../../runtime/source-requests";
import type { CreateSellerPayoutScenarioHarness } from "./harness";

export function registerSellerPayoutRecoveryHoldScenario(createHarness: CreateSellerPayoutScenarioHarness): void {
    test("clears only its own false recovery hold after an exact provider-confirmed replay", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(
                harness,
                "createConnectOnboardingSessionForUser",
                {
                    email: "seller@example.com",
                    country: "FR",
                },
                { userId: "seller-1" },
            ),
        );
        const command = {
            userId: "seller-1",
            payoutScheduleChangeId: "lost-provider-confirmation",
            interval: "weekly",
            weeklyPayoutDays: ["monday"],
            minimumBalanceEur: 0,
            delayDaysOverride: 14,
        };
        harness.rest.loseNextSellerPayoutSettingsResponse();

        const ambiguous = await sourceJson(harness, "configureSellerPayoutSchedule", command);
        expect(ambiguous.status).toBe(502);
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            risk_status: "manual_review",
            financial_hold_reason: "Seller recovery payout hold is not confirmed",
        });
        harness.rest.markFinancialOperationSucceeded("payout-schedule:seller-1:lost-provider-confirmation");

        const recovered = await okJson(await sourceJson(harness, "configureSellerPayoutSchedule", command));
        expect(recovered).toMatchObject({
            account: {
                riskStatus: "standard",
                financialHoldReason: null,
            },
        });
        expect(await okJson(await sourceRequestWithUser(harness, "seller-1", "getConnectStatus"))).toMatchObject({
            canReceiveProtectedPayments: true,
        });
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            risk_status: "standard",
            financial_hold_reason: null,
            payout_blocked_at: null,
        });

        harness.rest.setIndependentSellerRisk("seller-1", "Independent manual compliance review");
        const independentCommand = {
            ...command,
            payoutScheduleChangeId: "lost-provider-confirmation-independent-risk",
            weeklyPayoutDays: ["thursday"],
        };
        harness.rest.loseNextSellerPayoutSettingsResponse();
        expect((await sourceJson(harness, "configureSellerPayoutSchedule", independentCommand)).status).toBe(502);
        harness.rest.markFinancialOperationSucceeded(
            "payout-schedule:seller-1:lost-provider-confirmation-independent-risk",
        );
        harness.rest.setIndependentSellerRisk("seller-1", "Independent manual compliance review");

        const independentlyBlocked = await okJson(
            await sourceJson(harness, "configureSellerPayoutSchedule", independentCommand),
        );
        expect(independentlyBlocked).toMatchObject({
            account: {
                riskStatus: "manual_review",
                financialHoldReason: "Independent manual compliance review",
            },
        });
        expect(await okJson(await sourceRequestWithUser(harness, "seller-1", "getConnectStatus"))).toMatchObject({
            canReceiveProtectedPayments: false,
            riskStatus: "manual_review",
        });
    });
}
