import { expect, test } from "bun:test";
import type { StripeConnectHarness } from "../../runtime/harness";
import { okJson } from "../../runtime/http";
import { sourceJson, sourceRequest, sourceRequestWithUser } from "../../runtime/source-requests";

type CreateHarness = () => Promise<StripeConnectHarness>;

export function registerWalletSourceScenario(createHarness: CreateHarness): void {
    test("returns the authenticated seller wallet directly from Stripe", async () => {
        const harness = await createHarness();

        const emptyWallet = await okJson(await sourceRequest(harness, "getConnectWallet"));
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
        const wallet = await okJson(await sourceRequestWithUser(harness, "seller-1", "getConnectWallet"));

        expect(emptyWallet).toMatchObject({ connected: false, balances: [] });
        expect(wallet).toMatchObject({
            connected: true,
            stripeAccountId: "acct_seller_example_com",
            livemode: false,
            balances: [
                {
                    currency: "eur",
                    available: 4500,
                    pending: 1800,
                    total: 6300,
                    instantAvailable: 1000,
                    reserved: 200,
                },
                {
                    currency: "usd",
                    available: 0,
                    pending: 125,
                    total: 125,
                    instantAvailable: 0,
                    reserved: 0,
                },
            ],
        });
        expect(wallet.refreshedAt).toBeString();
    });
}
