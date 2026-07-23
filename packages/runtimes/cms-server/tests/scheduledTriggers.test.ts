import { describe, expect, test } from "bun:test";
import { startProductionScheduledTriggers } from "../src/scheduledTriggers";

describe("production scheduled triggers", () => {
    test("claims generic trigger records without embedding integration job IDs", async () => {
        const claims: unknown[] = [];
        const runner = startProductionScheduledTriggers({
            functions: {} as never,
            sources: {} as never,
            deps: {} as never,
            users: {} as never,
            installations: {} as never,
            triggers: {
                claimDueScheduledTriggers(request: unknown) {
                    claims.push(request);
                    return Promise.resolve([]);
                },
            } as never,
        });

        await runner.ready;
        expect(claims).toHaveLength(1);
        expect(claims[0]).toMatchObject({ limit: 10, leaseMs: 930_000 });
        expect(typeof runner.runNow).toBe("function");
        await runner.stop();
    });
});
