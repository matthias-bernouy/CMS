import { expect, test } from "bun:test";
import { jsonBody, okJson } from "../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../runtime/source-requests";
import type { CreateSellerPayoutScenarioHarness } from "./harness";

export function registerSellerPayoutConcurrencyScenario(createHarness: CreateSellerPayoutScenarioHarness): void {
    test("replaces a concurrent weekly payout update with the newer seller risk hold", async () => {
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
        const pause = harness.rest.pauseNextSellerBalanceSettingsUpdate();
        const configuring = sourceJson(harness, "configureSellerPayoutSchedule", {
            userId: "seller-1",
            payoutScheduleChangeId: "weekly-racing-new-risk",
            interval: "weekly",
            weeklyPayoutDays: ["monday"],
            reason: "Commerce policy before concurrent dispute",
        });

        await pause.entered;
        harness.rest.exposeSellerFinancialRisk("seller-1", 1080);
        pause.resume();
        const response = await configuring;
        const finalRisk = await okJson(await sourceRequest(harness, "getSellerProviderRisk", { userId: "seller-1" }));

        expect(response.status).toBe(409);
        expect(harness.rest.balanceSettingsUpdateCount).toBe(2);
        expect(await jsonBody(response)).toEqual({
            error: "payout schedule change was superseded by seller financial risk",
        });
        expect(finalRisk).toMatchObject({
            account: {
                payoutSchedule: "manual",
                riskStatus: "restricted",
                financialExposureAmount: 1080,
            },
            payoutControl: {
                interval: "manual",
                minimumBalanceByCurrency: { eur: 1080 },
            },
        });
    });
}
