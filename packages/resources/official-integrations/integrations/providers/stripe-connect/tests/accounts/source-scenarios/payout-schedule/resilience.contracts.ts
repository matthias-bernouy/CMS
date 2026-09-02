import { expect, test } from "bun:test";
import { okJson } from "../../../runtime/http";
import { sourceJson } from "../../../runtime/source-requests";
import type { CreateSellerPayoutScenarioHarness } from "./harness";

export function registerSellerPayoutResilienceScenarios(createHarness: CreateSellerPayoutScenarioHarness): void {
    test("does not let a Stripe event backlog starve money-operation recovery", async () => {
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
        const operationId = harness.rest.seedFailedSellerRiskHoldOperation("seller-1", 250);
        harness.rest.seedPendingStripeEvents(5);

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "fair-reconciliation-with-event-backlog",
                limit: 5,
            }),
        );

        expect(harness.rest.rows("stripe_events").filter((row) => row.processing_status === "pending")).toHaveLength(4);
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                id: operationId,
                status: "succeeded",
            }),
        );
    });

    test("recovers a lost automatic seller payout restoration response", async () => {
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
        harness.rest.loseNextSellerPayoutSettingsResponse();

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-restore-lost-response",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            payout_schedule: "daily",
            manual_payout_hold_started_at: null,
        });
        expect(
            harness.rest
                .rows("financial_operations")
                .filter((row) => String(row.business_key).includes("seller-risk-restore:seller-1")),
        ).toHaveLength(1);
        expect(harness.rest.rows("provider_exceptions")).toHaveLength(0);
    });

    test("reapplies the emergency hold when new exposure races automatic restoration", async () => {
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
        harness.rest.addRiskDuringNextSellerAutomaticRestore();

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-restore-risk-race",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            payout_schedule: "manual",
            financial_exposure_amount: 250,
            provider_hold_minimum_amount: 250,
            manual_payout_hold_started_at: "2026-07-01T00:00:00.000Z",
        });
    });

    test("repairs provider drift while an emergency seller hold is active", async () => {
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
        harness.rest.seedEmergencySellerHold("seller-1", 250);
        harness.rest.setConnectedPayoutSettings("daily", 0);

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-hold-provider-drift",
                limit: 25,
            }),
        );

        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            payout_schedule: "manual",
            financial_exposure_amount: 250,
            provider_hold_minimum_amount: 250,
        });
        expect(harness.rest.rows("provider_exceptions")).not.toContainEqual(
            expect.objectContaining({
                exception_type: "seller_manual_payout_hold_drift",
            }),
        );
    });
}
