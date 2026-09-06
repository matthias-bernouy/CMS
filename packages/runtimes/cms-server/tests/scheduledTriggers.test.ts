import { describe, expect, test } from "bun:test";
import { startProductionScheduledTriggers } from "../src/scheduledTriggers";

describe("production scheduled triggers", () => {
    test("does not access repositories or execute manual work while maintenance disables the scheduler", async () => {
        let accesses = 0;
        const unavailable = new Proxy(
            {},
            {
                get() {
                    accesses++;
                    throw new Error("Maintenance must not access a scheduled-work dependency");
                },
            },
        ) as never;
        const runner = startProductionScheduledTriggers({
            enabled: false,
            functions: unavailable,
            sources: unavailable,
            deps: unavailable,
            users: unavailable,
            installations: unavailable,
            triggers: unavailable,
        });

        await runner.ready;
        expect(await runner.runNow("scheduled-work")).toEqual({
            triggerId: "scheduled-work",
            runId: "",
            status: "disabled",
            durationMs: 0,
        });
        await runner.stop();
        expect(accesses).toBe(0);
    });

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
