import { describe, expect, test } from "bun:test";
import {
    InMemoryTriggerRepository,
    validateTrigger,
    type ScheduledTriggerClaimRequest,
    type TriggerRecord,
} from "@bernouy/cms-triggers";

describe("scheduled trigger repository", () => {
    test("rejects unsafe schedule and target combinations", () => {
        expect(
            validateTrigger({
                id: "invalid-schedule",
                event: { kind: "schedule", intervalMs: 1_000 },
                mode: "sync",
                failureMode: "block",
                condition: { exists: "$request.body" },
                function: { id: "worker", body: "$request.body" },
            }),
        ).toEqual(
            expect.arrayContaining([
                expect.stringContaining("intervalMs"),
                "scheduled triggers are asynchronous",
                "scheduled trigger failures cannot block a request",
                "scheduled triggers do not support conditions",
                expect.stringContaining('invalid reference "$request.body"'),
            ]),
        );
    });

    test("claims an occurrence once and advances from completion without catch-up", async () => {
        const repository = new InMemoryTriggerRepository();
        await repository.createTrigger(scheduledTrigger("2026-07-23T10:00:00.000Z"));
        const first = await repository.claimDueScheduledTriggers(
            request("worker-a", "2026-07-23T10:00:00.000Z", ["token-a", "run-a"]),
        );
        const concurrent = await repository.claimDueScheduledTriggers(
            request("worker-b", "2026-07-23T10:00:00.000Z", ["unused"]),
        );

        expect(first).toHaveLength(1);
        expect(concurrent).toEqual([]);
        expect(first[0]).toMatchObject({ runId: "run-a", runKey: "scheduled-trigger:scheduled-test:run-a" });

        const completed = await repository.completeScheduledTrigger({
            triggerId: "scheduled-test",
            token: "token-a",
            owner: "worker-a",
            finishedAt: "2026-07-23T10:00:05.000Z",
            lastRun: { at: "2026-07-23T10:00:05.000Z", status: "ok", runId: "run-a" },
        });
        expect(completed?.scheduleState).toEqual({ nextRunAt: "2026-07-23T10:01:05.000Z" });
    });

    test("reclaims an expired lease with the same run id and rejects the old owner", async () => {
        const repository = new InMemoryTriggerRepository();
        await repository.createTrigger(scheduledTrigger("2026-07-23T10:00:00.000Z"));
        await repository.claimDueScheduledTriggers(
            request("worker-a", "2026-07-23T10:00:00.000Z", ["token-a", "stable-run"], 1_000),
        );
        const reclaimed = await repository.claimDueScheduledTriggers(
            request("worker-b", "2026-07-23T10:00:02.000Z", ["token-b", "discarded-run"], 1_000),
        );

        expect(reclaimed[0]).toMatchObject({ token: "token-b", owner: "worker-b", runId: "stable-run" });
        expect(
            await repository.completeScheduledTrigger({
                triggerId: "scheduled-test",
                token: "token-a",
                owner: "worker-a",
                finishedAt: "2026-07-23T10:00:03.000Z",
                lastRun: { at: "2026-07-23T10:00:03.000Z", status: "ok" },
            }),
        ).toBeNull();
    });
});

function scheduledTrigger(nextRunAt: string): TriggerRecord {
    return {
        id: "scheduled-test",
        event: { kind: "schedule", intervalMs: 60_000 },
        task: { id: "test.task" },
        enabled: true,
        scheduleState: { nextRunAt },
    };
}

function request(owner: string, now: string, ids: string[], leaseMs = 60_000): ScheduledTriggerClaimRequest {
    let index = 0;
    return {
        owner,
        now,
        leaseMs,
        limit: 10,
        makeId: () => ids[index++] ?? `generated-${index}`,
    };
}
