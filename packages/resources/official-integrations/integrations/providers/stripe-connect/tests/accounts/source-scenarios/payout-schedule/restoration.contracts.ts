import { expect, test } from "bun:test";
import { okJson } from "../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../runtime/source-requests";
import type { CreateSellerPayoutScenarioHarness } from "./harness";

export function registerSellerPayoutRestorationScenarios(createHarness: CreateSellerPayoutScenarioHarness): void {
    test("restores the automatic seller payout schedule only after recovery exposure clears", async () => {
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
        harness.rest.seedEmergencySellerHold("seller-1", 0);

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-restore-cleared",
                limit: 25,
            }),
        );

        expect(reconciliation).toMatchObject({ repairedCount: 1, exceptionCount: 0 });
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            payout_schedule: "daily",
            manual_payout_hold_started_at: null,
            manual_payout_hold_deadline_at: null,
            manual_payout_hold_restore_settings: null,
        });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                business_key: expect.stringContaining("seller-risk-restore:seller-1"),
                status: "succeeded",
            }),
        );
    });

    test("restores exact weekly and monthly seller payout settings after an emergency hold", async () => {
        for (const [name, restoreSettings, expected] of [
            [
                "weekly",
                {
                    interval: "weekly",
                    weeklyPayoutDays: ["monday", "thursday"],
                    minimumBalanceEur: 125,
                    debitNegativeBalances: true,
                },
                { interval: "weekly", weeklyPayoutDays: ["monday", "thursday"] },
            ],
            [
                "monthly",
                {
                    interval: "monthly",
                    monthlyPayoutDays: [1, 15],
                    minimumBalanceEur: 250,
                    debitNegativeBalances: false,
                },
                { interval: "monthly", monthlyPayoutDays: [1, 15] },
            ],
        ] as const) {
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
            harness.rest.seedEmergencySellerHold("seller-1", 0, restoreSettings);

            await okJson(
                await sourceJson(harness, "runProviderReconciliation", {
                    runKey: `seller-payout-restore-${name}`,
                    limit: 25,
                }),
            );
            const risk = await okJson(await sourceRequest(harness, "getSellerProviderRisk", { userId: "seller-1" }));

            expect(risk.payoutControl, name).toMatchObject(expected);
            expect(risk.account).toMatchObject({
                payoutSchedule: name,
                manualPayoutHoldStartedAt: null,
                manualPayoutHoldDeadlineAt: null,
            });
        }
    });
}
