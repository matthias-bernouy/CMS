import { describe, expect, test } from "bun:test";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import {
    InMemoryFunctionRepository,
    startScheduledSystemFunctions,
    type CmsFunction,
    type ScheduledFunctionLogger,
    type ScheduledFunctionTimer,
} from "@bernouy/cms-functions";

const systemFunction = (id: string): CmsFunction => ({
    id,
    method: "POST",
    access: { mode: "system" },
    input: { body: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] } },
    output: [{ status: "200", body: { type: "object" } }],
    steps: [],
    return: { status: 200, body: {} },
});

function logger(): ScheduledFunctionLogger & { messages: string[] } {
    const messages: string[] = [];
    return {
        messages,
        info: message => messages.push(message),
        warn: message => messages.push(message),
        error: message => messages.push(message),
    };
}

function fakeTimer(): ScheduledFunctionTimer & { callbacks: Array<() => void>; delays: number[] } {
    const callbacks: Array<() => void> = [];
    const delays: number[] = [];
    return {
        callbacks,
        delays,
        set(callback, delay) {
            callbacks.push(callback);
            delays.push(delay);
            return callback;
        },
        clear(handle) {
            const index = callbacks.indexOf(handle as () => void);
            if (index >= 0) callbacks.splice(index, 1);
        },
    };
}

describe("scheduled system function runner", () => {
    test("executes only installed system POST functions and uses a dynamic body", async () => {
        const functions = new InMemoryFunctionRepository();
        await functions.createFunction(systemFunction("worker"));
        const timer = fakeTimer();
        const logs = logger();
        const runner = startScheduledSystemFunctions({
            functions,
            sources: new InMemorySourceRepository(),
            jobs: [{ functionId: "worker", intervalMs: 1_000, initialDelayMs: 25, body: ctx => ({ runId: ctx.runId }) }],
            timer,
            logger: logs,
            randomUUID: () => "run-1",
        });

        expect(timer.delays).toEqual([25]);
        expect(await runner.runNow("worker")).toMatchObject({ status: "succeeded", runId: "run-1", responseStatus: 200 });
        expect(logs.messages).toEqual([expect.stringContaining("worker succeeded")]);
        await runner.stop();
    });

    test("treats an absent function as an inert job so integrations can be installed later", async () => {
        const runner = startScheduledSystemFunctions({
            functions: new InMemoryFunctionRepository(),
            sources: new InMemorySourceRepository(),
            jobs: [{ functionId: "optional-worker", intervalMs: 1_000, body: () => ({}) }],
            timer: fakeTimer(),
            randomUUID: () => "missing-run",
        });

        expect(await runner.runNow("optional-worker")).toMatchObject({ status: "missing", runId: "missing-run" });
        await runner.stop();
    });

    test("fails closed for a non-system function", async () => {
        const functions = new InMemoryFunctionRepository();
        await functions.createFunction({ ...systemFunction("unsafe"), access: { mode: "admin" } });
        const logs = logger();
        const runner = startScheduledSystemFunctions({
            functions,
            sources: new InMemorySourceRepository(),
            jobs: [{ functionId: "unsafe", intervalMs: 1_000, body: () => ({}) }],
            timer: fakeTimer(),
            logger: logs,
        });

        expect((await runner.runNow("unsafe")).status).toBe("invalid");
        expect(logs.messages[0]).toContain("not a system POST function");
        await runner.stop();
    });

    test("keeps running after a failed invocation", async () => {
        const functions = new InMemoryFunctionRepository();
        await functions.createFunction({
            ...systemFunction("worker"),
            steps: [{
                assert: {
                    condition: { equals: [1, 2] },
                    failure: { status: 503, error: "temporary failure" },
                },
            }],
        });
        const runner = startScheduledSystemFunctions({
            functions,
            sources: new InMemorySourceRepository(),
            jobs: [{ functionId: "worker", intervalMs: 1_000, body: ctx => ({ runId: ctx.runId }) }],
            timer: fakeTimer(),
            logger: logger(),
        });

        expect((await runner.runNow("worker")).status).toBe("failed");
        await functions.updateFunction(systemFunction("worker"));
        expect((await runner.runNow("worker")).status).toBe("succeeded");
        await runner.stop();
    });

    test("never overlaps the same job and schedules its next tick after completion", async () => {
        const functions = new InMemoryFunctionRepository();
        await functions.createFunction(systemFunction("worker"));
        const timer = fakeTimer();
        const runner = startScheduledSystemFunctions({
            functions,
            sources: new InMemorySourceRepository(),
            jobs: [{ functionId: "worker", intervalMs: 2_000, body: ctx => ({ runId: ctx.runId }) }],
            timer,
            logger: logger(),
        });

        const first = runner.runNow("worker");
        const second = await runner.runNow("worker");
        expect(second.status).toBe("already_running");
        expect((await first).status).toBe("succeeded");
        await runner.stop();
    });
});
