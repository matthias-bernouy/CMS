import { describe, expect, test } from "bun:test";
import {
    InMemoryTriggerRepository,
    startScheduledTriggers,
    type ScheduledTriggerTaskContext,
    type ScheduledTriggerTimer,
    type TriggerRecord,
} from "@bernouy/cms-triggers";

const PASSIVE_TIMER: ScheduledTriggerTimer = {
    set: () => "timer",
    clear: () => undefined,
};

describe("scheduled trigger runner", () => {
    test("executes registered tasks with resolved schedule context and records the result", async () => {
        const repository = new InMemoryTriggerRepository();
        await repository.createTrigger(trigger("2026-07-23T10:00:00.000Z"));
        const calls: Array<{ body: unknown; context: ScheduledTriggerTaskContext }> = [];
        const runner = startScheduledTriggers({
            triggers: repository,
            functions: { getFunction: async () => null } as never,
            sources: {} as never,
            tasks: new Map([
                [
                    "test.task",
                    async (body, context) => {
                        calls.push({ body, context });
                        return Response.json({ accepted: true });
                    },
                ],
            ]),
            timer: PASSIVE_TIMER,
            now: () => new Date("2026-07-23T10:00:00.000Z"),
            randomUUID: ids("token", "run"),
            workerId: "runner-a",
        });

        await runner.ready;
        expect(calls).toEqual([
            {
                body: { runKey: "scheduled-trigger:scheduled-runner:run" },
                context: expect.objectContaining({
                    triggerId: "scheduled-runner",
                    runId: "run",
                    runKey: "scheduled-trigger:scheduled-runner:run",
                }),
            },
        ]);
        expect(await repository.getTrigger("scheduled-runner")).toMatchObject({
            lastRun: { status: "ok", runId: "run", responseStatus: 200 },
        });
        await runner.stop();
    });

    test("refuses overlapping run-now claims", async () => {
        const repository = new InMemoryTriggerRepository();
        await repository.createTrigger(trigger("2026-07-24T10:00:00.000Z"));
        let release!: () => void;
        const blocked = new Promise<void>((resolve) => {
            release = resolve;
        });
        const runner = startScheduledTriggers({
            triggers: repository,
            functions: { getFunction: async () => null } as never,
            sources: {} as never,
            tasks: new Map([
                [
                    "test.task",
                    async () => {
                        await blocked;
                        return new Response(null, { status: 204 });
                    },
                ],
            ]),
            timer: PASSIVE_TIMER,
            now: () => new Date("2026-07-23T10:00:00.000Z"),
            randomUUID: ids("token", "run", "other-token", "other-run"),
            workerId: "runner-a",
        });
        await runner.ready;

        const first = runner.runNow("scheduled-runner");
        await Promise.resolve();
        expect(await runner.runNow("scheduled-runner")).toMatchObject({ status: "already_running", runId: "run" });
        release();
        expect(await first).toMatchObject({ status: "succeeded", runId: "run" });
        await runner.stop();
    });
});

function trigger(nextRunAt: string): TriggerRecord {
    return {
        id: "scheduled-runner",
        event: { kind: "schedule", intervalMs: 60_000 },
        task: { id: "test.task", body: { runKey: "$schedule.runKey" } },
        enabled: true,
        scheduleState: { nextRunAt },
    };
}

function ids(...values: string[]): () => string {
    let index = 0;
    return () => values[index++] ?? `generated-${index}`;
}
