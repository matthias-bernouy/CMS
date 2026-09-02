import { expect, test } from "bun:test";
import { okJson } from "../../../runtime/http";
import { sourceJson, sourceRequest } from "../../../runtime/source-requests";
import type { CreateSellerPayoutScenarioHarness } from "./harness";

export function registerSellerPayoutBaselineScenarios(createHarness: CreateSellerPayoutScenarioHarness): void {
    test("preserves an exact pre-existing manual payout baseline through an emergency hold", async () => {
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
        harness.rest.setConnectedPayoutSettings("manual", 75);
        harness.rest.exposeSellerFinancialRisk("seller-1", 250);

        await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-manual-baseline-hold",
                limit: 25,
            }),
        );
        expect(harness.rest.rows("accounts")[0]?.manual_payout_hold_restore_settings).toEqual({
            interval: "manual",
            minimumBalanceEur: 75,
            debitNegativeBalances: false,
        });
        harness.rest.exposeSellerFinancialRisk("seller-1", 0);

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-restore-manual-baseline",
                limit: 25,
            }),
        );

        expect(reconciliation).toMatchObject({ exceptionCount: 0 });
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            payout_schedule: "manual",
            manual_payout_hold_started_at: null,
            manual_payout_hold_deadline_at: null,
            manual_payout_hold_restore_settings: null,
        });
        const risk = await okJson(await sourceRequest(harness, "getSellerProviderRisk", { userId: "seller-1" }));
        expect(risk.payoutControl).toMatchObject({
            interval: "manual",
            minimumBalanceByCurrency: { eur: 75 },
        });
        expect(harness.rest.rows("provider_exceptions")).toHaveLength(0);
    });

    test("restores a seller payout baseline after Stripe committed a hold but the database response was lost", async () => {
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

        const reconciliation = await okJson(
            await sourceJson(harness, "runProviderReconciliation", {
                runKey: "seller-payout-hold-operation-recovery-cleared-risk",
                limit: 25,
            }),
        );

        expect(reconciliation).toMatchObject({ exceptionCount: 0 });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                id: operationId,
                status: "succeeded",
            }),
        );
        expect(harness.rest.rows("accounts")[0]).toMatchObject({
            payout_schedule: "daily",
            provider_hold_minimum_amount: 250,
            manual_payout_hold_started_at: null,
            manual_payout_hold_restore_settings: null,
        });
        const risk = await okJson(await sourceRequest(harness, "getSellerProviderRisk", { userId: "seller-1" }));
        expect(risk.payoutControl).toMatchObject({
            interval: "daily",
            minimumBalanceByCurrency: {},
            debitNegativeBalances: false,
        });
    });
}
