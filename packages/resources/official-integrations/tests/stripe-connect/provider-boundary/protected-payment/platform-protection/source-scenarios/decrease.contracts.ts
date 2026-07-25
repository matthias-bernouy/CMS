import { expect, test } from "bun:test";
import type { StripeConnectHarness } from "../../../../runtime/harness";
import { okJson } from "../../../../runtime/http";
import { sourceJson } from "../../../../runtime/source-requests";
import { waitForPlatformPayoutClaimAttempts } from "./concurrency";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerPlatformReserveDecreaseSourceScenarios(createHarness: CreateHarness): void {
    test("retains an overcovered platform reserve until Finance authorizes the exact decrease", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-increase-r1",
                minimumBalanceEur: 35476,
                liabilityRevision: 1,
                debitNegativeBalances: false,
            }),
        );

        const retained = await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-decrease-r2-retained",
                minimumBalanceEur: 34496,
                liabilityRevision: 2,
                debitNegativeBalances: false,
            }),
        );
        expect(retained).toMatchObject({
            liabilityRevision: 2,
            appliedMinimumBalanceEur: 35476,
            decreaseAuthorizationId: null,
            payoutControl: { minimumBalanceByCurrency: { eur: 35476 } },
        });
        expect(harness.rest.rows("platform_payout_controls")[0]).toMatchObject({
            liability_revision: 2,
            required_minimum_amount: 34496,
            provider_minimum_amount: 35476,
            decrease_authorization_id: null,
            claim_owner: null,
        });
        const retainedReplay = await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-decrease-r2-retained",
                minimumBalanceEur: 34496,
                liabilityRevision: 2,
                debitNegativeBalances: false,
            }),
        );
        expect(retainedReplay).toMatchObject({
            liabilityRevision: 2,
            appliedMinimumBalanceEur: 35476,
        });
        expect(harness.rest.balanceSettingsUpdateCount).toBe(1);

        const authorizationId = "11111111-1111-4111-8111-111111111111";
        const decreased = await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-decrease-r2",
                minimumBalanceEur: 34496,
                liabilityRevision: 2,
                decreaseAuthorizationId: authorizationId,
                debitNegativeBalances: false,
            }),
        );
        expect(decreased).toMatchObject({
            liabilityRevision: 2,
            appliedMinimumBalanceEur: 34496,
            decreaseAuthorizationId: authorizationId,
            payoutControl: { minimumBalanceByCurrency: { eur: 34496 } },
        });

        const stale = await sourceJson(harness, "configurePlatformPayoutControls", {
            platformPayoutControlChangeId: "platform-stale-r1",
            minimumBalanceEur: 35476,
            liabilityRevision: 1,
            debitNegativeBalances: false,
        });
        expect(stale.status).toBe(409);
        expect(harness.rest.rows("platform_payout_controls")[0]).toMatchObject({
            liability_revision: 2,
            required_minimum_amount: 34496,
            provider_minimum_amount: 34496,
            decrease_authorization_id: null,
        });
    });

    test("never lowers a higher provider-side platform reserve drift without Finance authority", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-provider-drift-r1",
                minimumBalanceEur: 100,
                liabilityRevision: 1,
                debitNegativeBalances: false,
            }),
        );
        harness.rest.setPlatformPayoutMinimum(450);

        const retained = await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-provider-drift-r2",
                minimumBalanceEur: 200,
                liabilityRevision: 2,
                debitNegativeBalances: false,
            }),
        );

        expect(retained).toMatchObject({
            liabilityRevision: 2,
            appliedMinimumBalanceEur: 450,
            decreaseAuthorizationId: null,
            payoutControl: { minimumBalanceByCurrency: { eur: 450 } },
        });
        expect(harness.rest.rows("platform_payout_controls")[0]).toMatchObject({
            liability_revision: 2,
            required_minimum_amount: 200,
            provider_minimum_amount: 450,
            claim_owner: null,
        });
    });

    test("reports the final consumed authority when a higher revision wins during a decrease", async () => {
        const harness = await createHarness();
        await okJson(
            await sourceJson(harness, "configurePlatformPayoutControls", {
                platformPayoutControlChangeId: "platform-authority-race-r1",
                minimumBalanceEur: 500,
                liabilityRevision: 1,
                debitNegativeBalances: false,
            }),
        );
        const authorizationId = "22222222-2222-4222-8222-222222222222";
        const pause = harness.rest.pauseNextPlatformBalanceSettingsUpdate();
        const decreasing = sourceJson(harness, "configurePlatformPayoutControls", {
            platformPayoutControlChangeId: "platform-authority-race-r2",
            minimumBalanceEur: 200,
            liabilityRevision: 2,
            decreaseAuthorizationId: authorizationId,
            debitNegativeBalances: false,
        });
        await pause.entered;
        const higher = sourceJson(harness, "configurePlatformPayoutControls", {
            platformPayoutControlChangeId: "platform-authority-race-r3",
            minimumBalanceEur: 700,
            liabilityRevision: 3,
            debitNegativeBalances: false,
        });
        await waitForPlatformPayoutClaimAttempts(harness, 3);
        pause.resume();
        const [completed, higherCompleted] = await Promise.all([decreasing.then(okJson), higher.then(okJson)]);

        expect(completed).toMatchObject({
            liabilityRevision: 3,
            appliedMinimumBalanceEur: 700,
            decreaseAuthorizationId: null,
            payoutControl: { minimumBalanceByCurrency: { eur: 700 } },
        });
        expect(higherCompleted).toMatchObject({
            liabilityRevision: 3,
            appliedMinimumBalanceEur: 700,
            decreaseAuthorizationId: null,
        });
        expect(harness.rest.rows("platform_payout_controls")[0]).toMatchObject({
            liability_revision: 3,
            required_minimum_amount: 700,
            provider_minimum_amount: 700,
            decrease_authorization_id: null,
        });
        expect(harness.rest.rows("financial_operations")).toContainEqual(
            expect.objectContaining({
                request: expect.objectContaining({
                    commerceRequestedDecreaseAuthorizationId: authorizationId,
                    commerceLiabilityRevision: 3,
                }),
            }),
        );
    });
}
