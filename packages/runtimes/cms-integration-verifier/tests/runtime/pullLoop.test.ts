import { describe, expect, test } from "bun:test";
import {
    VerificationSupervisorError,
    runVerificationPullLoop,
    type VerificationPullLoopDiagnostic,
    type VerificationSupervisor,
} from "../../src";

describe("verification pull loop", () => {
    test("polls again after idle work and stops cleanly", async () => {
        const controller = new AbortController();
        const sleeps: number[] = [];
        let polls = 0;
        await runVerificationPullLoop({
            supervisor: supervisor(async () => {
                polls += 1;
                return { outcome: "idle" };
            }),
            signal: controller.signal,
            pollIntervalMs: 25,
            errorBackoffMs: 50,
            async sleep(duration) {
                sleeps.push(duration);
                if (sleeps.length === 2) {
                    controller.abort();
                }
            },
        });

        expect(polls).toBe(2);
        expect(sleeps).toEqual([25, 25]);
    });

    test("backs off with a bounded diagnostic that cannot echo an unknown secret", async () => {
        const controller = new AbortController();
        const diagnostics: VerificationPullLoopDiagnostic[] = [];
        const secret = "worker-token-never-log";
        await runVerificationPullLoop({
            supervisor: supervisor(async () => {
                throw new Error(`transport leaked ${secret}`);
            }),
            signal: controller.signal,
            pollIntervalMs: 25,
            errorBackoffMs: 75,
            onDiagnostic: (diagnostic) => diagnostics.push(diagnostic),
            async sleep(duration) {
                expect(duration).toBe(75);
                controller.abort();
            },
        });

        expect(diagnostics).toEqual([{ code: "worker-operation-failed", retryable: false }]);
        expect(JSON.stringify(diagnostics)).not.toContain(secret);
    });

    test("propagates shutdown to an active claim operation", async () => {
        const controller = new AbortController();
        let observedAbort = false;
        const running = runVerificationPullLoop({
            supervisor: supervisor(
                async (signal) =>
                    await new Promise((_, reject) => {
                        signal?.addEventListener(
                            "abort",
                            () => {
                                observedAbort = true;
                                reject(new VerificationSupervisorError("aborted", "stopped", true));
                            },
                            { once: true },
                        );
                    }),
            ),
            signal: controller.signal,
            pollIntervalMs: 25,
            errorBackoffMs: 50,
        });

        controller.abort();
        await running;
        expect(observedAbort).toBe(true);
    });
});

function supervisor(runNext: VerificationSupervisor["runNext"]): VerificationSupervisor {
    return { runNext };
}
