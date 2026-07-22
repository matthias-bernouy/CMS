import { expect, test } from "bun:test";
import type { StripeConnectHarness } from "../../../../runtime/harness";
import { okJson } from "../../../../runtime/http";
import { sourceJson } from "../../../../runtime/source-requests";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerPlatformReserveIncreaseSourceScenarios(createHarness: CreateHarness): void {
    test("keeps the higher platform reserve when payout protection commands race", async () => {
        const harness = await createHarness();
        const pause = harness.rest.pauseNextPlatformBalanceSettingsUpdate();
        const lowerUpdate = sourceJson(harness, "configurePlatformPayoutControls", {
            platformPayoutControlChangeId: "platform-race-lower",
            minimumBalanceEur: 100,
            liabilityRevision: 1,
            debitNegativeBalances: true,
        });

        await pause.entered;
        const higherUpdate = await sourceJson(harness, "configurePlatformPayoutControls", {
            platformPayoutControlChangeId: "platform-race-higher",
            minimumBalanceEur: 200,
            liabilityRevision: 2,
            debitNegativeBalances: true,
        });
        pause.resume();
        const completed = await okJson(await lowerUpdate);

        expect(higherUpdate.status).toBe(409);
        expect(completed).toMatchObject({
            liabilityRevision: 2,
            payoutControl: { interval: "daily", minimumBalanceByCurrency: { eur: 200 } },
        });
        expect(harness.rest.balanceSettingsUpdateCount).toBe(2);
        expect(harness.rest.rows("platform_payout_controls")[0]).toMatchObject({
            liability_revision: 2,
            required_minimum_amount: 200,
            provider_minimum_amount: 200,
            claim_owner: null,
        });
    });

    test("recovers a lost platform payout protection response without lowering the reserve", async () => {
        const harness = await createHarness();
        const command = {
            platformPayoutControlChangeId: "platform-lost-response",
            minimumBalanceEur: 350,
            liabilityRevision: 1,
            debitNegativeBalances: true,
        };
        harness.rest.loseNextPlatformPayoutProtectionResponse();

        const ambiguous = await sourceJson(harness, "configurePlatformPayoutControls", command);
        const recovered = await okJson(await sourceJson(harness, "configurePlatformPayoutControls", command));

        expect(ambiguous.status).toBe(502);
        expect(recovered).toMatchObject({
            payoutControl: { interval: "daily", minimumBalanceByCurrency: { eur: 350 } },
        });
        expect(harness.rest.balanceSettingsUpdateCount).toBe(1);
        expect(harness.rest.rows("platform_payout_controls")[0]).toMatchObject({
            required_minimum_amount: 350,
            provider_minimum_amount: 350,
            last_error: null,
        });
    });
}
