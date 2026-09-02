import { expect, test } from "bun:test";
import { okJson } from "../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../runtime/source-requests";
import type { CreateSellerPayoutScenarioHarness } from "./harness";

export function registerSellerPayoutConfigurationScenarios(createHarness: CreateSellerPayoutScenarioHarness): void {
    test("accepts the compact configurable payout schedule used by linking integrations", async () => {
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

        const configured = await okJson(
            await sourceJson(harness, "configureSellerPayoutSchedule", {
                userId: "seller-1",
                payoutScheduleChangeId: "compact-monthly-policy",
                payoutSchedule: "monthly:1,15,31",
                minimumBalanceEur: 0,
                delayDaysOverride: 0,
            }),
        );

        expect(configured).toMatchObject({
            payoutScheduleChangeId: "compact-monthly-policy",
            payoutControl: {
                interval: "monthly",
                monthlyPayoutDays: [1, 15, 31],
                minimumBalanceByCurrency: {},
                delayDaysOverride: 0,
            },
        });
        expect(harness.rest.balanceSettingsUpdateCount).toBe(1);
    });

    test("reads and idempotently applies Commerce seller payout controls", async () => {
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

        const before = await okJson(await sourceRequest(harness, "getSellerProviderRisk", { userId: "seller-1" }));
        const command = {
            userId: "seller-1",
            payoutScheduleChangeId: "risk-policy-7:seller-1",
            interval: "weekly",
            weeklyPayoutDays: ["monday", "thursday"],
            minimumBalanceEur: 2500,
            delayDaysOverride: 7,
            debitNegativeBalances: true,
            reason: "Versioned Commerce seller risk policy 7",
        };
        const configured = await okJson(await sourceJson(harness, "configureSellerPayoutSchedule", command));
        const replayed = await okJson(await sourceJson(harness, "configureSellerPayoutSchedule", command));
        const mismatch = await sourceJson(harness, "configureSellerPayoutSchedule", {
            ...command,
            interval: "manual",
            weeklyPayoutDays: undefined,
        });

        expect(before).toMatchObject({ payoutControl: { interval: "daily" } });
        expect(configured).toMatchObject({
            payoutScheduleChangeId: "risk-policy-7:seller-1",
            payoutControl: {
                interval: "weekly",
                weeklyPayoutDays: ["monday", "thursday"],
                minimumBalanceByCurrency: { eur: 2500 },
                delayDaysOverride: 7,
                debitNegativeBalances: true,
            },
        });
        expect(replayed.providerOperationId).toBe(configured.providerOperationId);
        expect(harness.rest.balanceSettingsUpdateCount).toBe(1);
        expect(mismatch.status).toBe(409);
    });

    test("accepts Stripe omitting a zero payout minimum but rejects an omitted positive minimum", async () => {
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

        const zeroMinimum = await okJson(
            await sourceJson(harness, "configureSellerPayoutSchedule", {
                userId: "seller-1",
                payoutScheduleChangeId: "zero-minimum-canonicalized-by-stripe",
                interval: "weekly",
                weeklyPayoutDays: ["monday"],
                minimumBalanceEur: 0,
                delayDaysOverride: 14,
            }),
        );
        harness.rest.omitMinimumBalanceOnNextBalanceSettingsUpdate();
        const missingPositiveMinimum = await sourceJson(harness, "configureSellerPayoutSchedule", {
            userId: "seller-1",
            payoutScheduleChangeId: "missing-positive-minimum",
            interval: "weekly",
            weeklyPayoutDays: ["monday"],
            minimumBalanceEur: 500,
            delayDaysOverride: 14,
        });

        expect(zeroMinimum).toMatchObject({
            payoutControl: {
                interval: "weekly",
                weeklyPayoutDays: ["monday"],
                minimumBalanceByCurrency: {},
                delayDaysOverride: 14,
            },
        });
        expect(missingPositiveMinimum.status).toBe(502);
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                business_key: "payout-schedule:seller-1:missing-positive-minimum",
                status: "manual_review",
            }),
        );
    });
}
