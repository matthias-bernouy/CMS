import { VerificationProtocolError } from "../protocol";
import { VerificationSupervisorError, type VerificationSupervisor } from "../supervisor";

export type VerificationPullLoopDiagnostic = Readonly<{
    code: string;
    retryable: boolean;
}>;

export type VerificationPullLoopConfig = Readonly<{
    supervisor: VerificationSupervisor;
    signal: AbortSignal;
    pollIntervalMs: number;
    errorBackoffMs: number;
    onDiagnostic?(diagnostic: VerificationPullLoopDiagnostic): void;
    sleep?(durationMs: number, signal: AbortSignal): Promise<void>;
}>;

export async function runVerificationPullLoop(config: VerificationPullLoopConfig): Promise<void> {
    assertLoopConfig(config);
    const sleep = config.sleep ?? abortableSleep;
    while (!config.signal.aborted) {
        try {
            const result = await config.supervisor.runNext(config.signal);
            if (result.outcome === "idle") {
                await sleep(config.pollIntervalMs, config.signal);
            }
        } catch (error) {
            if (config.signal.aborted || (error instanceof VerificationSupervisorError && error.code === "aborted")) {
                return;
            }
            config.onDiagnostic?.(safeDiagnostic(error));
            await sleep(config.errorBackoffMs, config.signal);
        }
    }
}

function safeDiagnostic(error: unknown): VerificationPullLoopDiagnostic {
    if (error instanceof VerificationProtocolError) {
        return {
            code: error.code ? `protocol-${error.code}` : `protocol-${error.kind}`,
            retryable: error.retryable,
        };
    }
    if (error instanceof VerificationSupervisorError) {
        return { code: `supervisor-${error.code}`, retryable: error.retryable };
    }
    return { code: "worker-operation-failed", retryable: false };
}

async function abortableSleep(durationMs: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
        return;
    }
    await new Promise<void>((resolve) => {
        const timer = setTimeout(finish, durationMs);
        signal.addEventListener("abort", finish, { once: true });
        function finish() {
            clearTimeout(timer);
            signal.removeEventListener("abort", finish);
            resolve();
        }
    });
}

function assertLoopConfig(config: VerificationPullLoopConfig): void {
    if (
        !Number.isSafeInteger(config.pollIntervalMs) ||
        config.pollIntervalMs < 1 ||
        !Number.isSafeInteger(config.errorBackoffMs) ||
        config.errorBackoffMs < 1
    ) {
        throw new TypeError("Verification pull-loop intervals must be positive integers");
    }
}
