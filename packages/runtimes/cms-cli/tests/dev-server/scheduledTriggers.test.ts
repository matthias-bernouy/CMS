import { describe, expect, test } from "bun:test";
import { startDevScheduledTriggers } from "../../src/dev-server/runtime/scheduledTriggers";

describe("development scheduled triggers", () => {
    test("uses the installed trigger repository instead of a runtime job array", async () => {
        const claims: unknown[] = [];
        const runner = startDevScheduledTriggers({
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
        await runner.stop();
    });
});
