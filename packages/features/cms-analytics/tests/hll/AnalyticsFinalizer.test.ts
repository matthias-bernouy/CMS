import { describe, expect, test } from "bun:test";
import { startAnalyticsFinalizer } from "cms-analytics/core/hll/AnalyticsFinalizer";

describe("startAnalyticsFinalizer", () => {
    test("runs at boot with the supplied UTC clock and can be stopped", async () => {
        const before = new Date("2026-06-04T12:34:56Z");
        let resolveRun!: () => void;
        const ran = new Promise<void>((resolve) => (resolveRun = resolve));
        const calls: Date[] = [];
        const finalizer = startAnalyticsFinalizer(
            {
                finalizeVisitors: async (value: Date) => {
                    calls.push(value);
                    resolveRun();
                },
            } as never,
            { now: () => before },
        );
        await ran;
        finalizer.stop();
        expect(calls).toEqual([before]);
    });

    test("reports background errors without rejecting the scheduler", async () => {
        let resolveError!: (error: unknown) => void;
        const failed = new Promise<unknown>((resolve) => (resolveError = resolve));
        const finalizer = startAnalyticsFinalizer(
            { finalizeVisitors: async () => Promise.reject(new Error("offline")) } as never,
            { onError: resolveError },
        );
        expect(await failed).toBeInstanceOf(Error);
        finalizer.stop();
    });
});
