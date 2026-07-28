import { describe, expect, mock, test } from "bun:test";
import { registerRepositoryShutdown } from "../src/shutdown";

describe("registerRepositoryShutdown", () => {
    test("coalesces concurrent signals into one graceful stop and exit", async () => {
        const stop = mock(async () => undefined);
        const exit = mock((_code: number) => undefined);
        const report = mock((_message: string) => undefined);
        const signals = signalSource();
        const registration = registerRepositoryShutdown(
            { refreshCatalog: async () => neverRefreshResult(), stop },
            { signals, exit, report },
        );

        await Promise.all([registration.shutdown("SIGINT"), registration.shutdown("SIGTERM")]);

        expect(stop).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledTimes(1);
        expect(exit).toHaveBeenCalledWith(0);
        expect(report).not.toHaveBeenCalled();
        registration.dispose();
        expect(signals.listenerCount()).toBe(0);
    });

    test("returns a non-zero exit without exposing the stop failure", async () => {
        const exit = mock((_code: number) => undefined);
        const report = mock((_message: string) => undefined);
        const registration = registerRepositoryShutdown(
            {
                refreshCatalog: async () => neverRefreshResult(),
                stop: async () => {
                    throw new Error("secret adapter detail");
                },
            },
            { signals: signalSource(), exit, report },
        );

        await registration.shutdown("SIGTERM");

        expect(exit).toHaveBeenCalledWith(1);
        expect(report).toHaveBeenCalledWith("Integration repository shutdown failed after SIGTERM");
        expect(report.mock.calls.flat().join(" ")).not.toContain("secret adapter detail");
    });
});

function signalSource() {
    const listeners = new Map<string, Set<() => void>>();
    return {
        on(signal: string, listener: () => void) {
            const registered = listeners.get(signal) ?? new Set();
            registered.add(listener);
            listeners.set(signal, registered);
            return this;
        },
        off(signal: string, listener: () => void) {
            listeners.get(signal)?.delete(listener);
            return this;
        },
        listenerCount() {
            return [...listeners.values()].reduce((count, registered) => count + registered.size, 0);
        },
    };
}

function neverRefreshResult() {
    return {
        applied: false,
        status: {
            status: "unready" as const,
            ready: false,
            revision: 0,
            integrations: 0,
            diagnostics: 0,
            quarantined: 0,
            lastRefreshFailed: true,
        },
    };
}
