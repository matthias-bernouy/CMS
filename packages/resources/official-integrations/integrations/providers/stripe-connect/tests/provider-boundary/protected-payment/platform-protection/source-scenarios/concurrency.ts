import type { StripeConnectHarness } from "../../../../runtime/harness";

export async function waitForPlatformPayoutClaimAttempts(
    harness: StripeConnectHarness,
    expected: number,
): Promise<void> {
    const claimRequest = "postgrest:POST:rpc/claim_platform_payout_protection";
    for (let attempt = 0; attempt < 100; attempt++) {
        if (harness.rest.externalRequestOrder.filter((request) => request === claimRequest).length >= expected) {
            return;
        }
        await Bun.sleep(5);
    }
    throw new Error(`expected ${expected} platform payout protection claim attempts`);
}
