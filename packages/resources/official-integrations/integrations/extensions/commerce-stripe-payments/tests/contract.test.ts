import { describe, expect, test } from "bun:test";
import { loadIntegrationContract } from "./integration-contract/harness";
import { runIntegrationContract } from "./integration-contract/scenario";

describe("commerce-stripe-payments 1.0.0", () => {
    test("imports and creates a payment from trusted order data with the canonical CMS seller identity", async () => {
        await runIntegrationContract();
    });

    test("reads the current seller payout schedule from provider settings instead of installation answers", async () => {
        const { releaseFn, releaseWorker } = await loadIntegrationContract("weekly:monday,thursday");
        const serialized = JSON.stringify({ releaseFn, releaseWorker });

        expect(serialized).toContain('"payoutSchedule":"$steps.providerConfiguration.sellerPayoutSchedule"');
        expect(serialized).toContain('"endpoint":"getProviderConfiguration"');
        expect(serialized).not.toContain("weekly:monday,thursday");
        expect(serialized).not.toContain('"interval":"weekly"');
        expect(serialized).not.toContain('"weeklyPayoutDays":["monday"]');
    });
});
