import { describe, expect, test } from "bun:test";
import { loadIntegrationContract } from "./integration-contract/harness";
import { runIntegrationContract } from "./integration-contract/scenario";

describe("commerce-stripe-payments 1.0.0", () => {
    test("imports and creates a payment from trusted order data with the canonical CMS seller identity", async () => {
        await runIntegrationContract();
    });

    test("resolves a non-default seller payout schedule into releases without a weekly hardcode", async () => {
        const { releaseFn, releaseWorker } = await loadIntegrationContract("weekly:monday,thursday");
        const serialized = JSON.stringify({ releaseFn, releaseWorker });

        expect(serialized).toContain('"payoutSchedule":"weekly:monday,thursday"');
        expect(serialized).toContain(
            '"payoutScheduleChangeId":{"$concat":["settlement-release:","$input.body.releaseAuthorizationId",":","$input.body.sellerRequiredMinimumBalanceAmount",":","$input.body.payoutDelayDays",":","weekly:monday,thursday"]}',
        );
        expect(serialized).not.toContain('"interval":"weekly"');
        expect(serialized).not.toContain('"weeklyPayoutDays":["monday"]');
    });
});
