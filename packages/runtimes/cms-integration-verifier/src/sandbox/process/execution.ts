import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { ProcessVerificationSandboxError, type ProcessVerificationSandboxConfig } from "./types";
import { readBoundedChildStream, writeChildInput } from "./streams";
import { createIsolatedTempDirectory, removeIsolatedTempDirectory } from "./tempDirectory";
import { observeChildClose, terminateChild } from "./termination";

export async function executeSandboxProcess(
    config: ProcessVerificationSandboxConfig,
    input: Uint8Array,
    signal: AbortSignal,
): Promise<Uint8Array> {
    if (input.byteLength > config.maxInputBytes) {
        throw new ProcessVerificationSandboxError("input-limit");
    }
    const temporaryDirectory = await createTempDirectory(config.tempRoot);
    let child: ChildProcessWithoutNullStreams | undefined;
    try {
        child = launch(config, temporaryDirectory);
        return await superviseChild(config, child, input, signal);
    } catch (error) {
        if (error instanceof ProcessVerificationSandboxError) {
            throw error;
        }
        throw new ProcessVerificationSandboxError(child ? "process-failed" : "launch-failed");
    } finally {
        try {
            if (child?.pid) {
                await terminateChild(child, config.terminationGraceMs);
            }
            await removeIsolatedTempDirectory(temporaryDirectory);
        } catch {
            throw new ProcessVerificationSandboxError("cleanup-failed");
        }
    }
}

async function createTempDirectory(tempRoot: string): Promise<string> {
    try {
        return await createIsolatedTempDirectory(tempRoot);
    } catch (error) {
        if (error instanceof ProcessVerificationSandboxError) {
            throw error;
        }
        throw new ProcessVerificationSandboxError("launch-failed");
    }
}

function launch(config: ProcessVerificationSandboxConfig, cwd: string): ChildProcessWithoutNullStreams {
    return spawn(config.executable, [...(config.arguments ?? [])], {
        cwd,
        detached: true,
        env: {
            ...(config.environment ?? {}),
            HOME: cwd,
            TMPDIR: cwd,
            TMP: cwd,
            TEMP: cwd,
        },
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
    });
}

async function superviseChild(
    config: ProcessVerificationSandboxConfig,
    child: ChildProcessWithoutNullStreams,
    input: Uint8Array,
    signal: AbortSignal,
): Promise<Uint8Array> {
    const closed = observeChildClose(child);
    const stdout = readBoundedChildStream(child.stdout, config.maxOutputBytes, "output-limit");
    const stderr = readBoundedChildStream(child.stderr, config.maxErrorBytes, "error-output-limit");
    const completed = Promise.all([writeChildInput(child, input), stdout, stderr, closed]);
    const launchFailure = waitForLaunchFailure(child);
    const stop = stopReason(signal, config.timeoutMs);
    try {
        const winner = await Promise.race([
            completed.then((value) => ({ kind: "completed" as const, value })),
            launchFailure,
            stop.promise,
        ]);
        if (winner.kind !== "completed") {
            await terminateChild(child, config.terminationGraceMs, closed);
            await completed.catch(() => undefined);
            throw new ProcessVerificationSandboxError(winner.kind);
        }
        const [, output, errorOutput, status] = winner.value;
        if (status.launchError) {
            throw new ProcessVerificationSandboxError("launch-failed");
        }
        if (status.code !== 0 || status.signal !== null) {
            throw new ProcessVerificationSandboxError("process-failed", Buffer.from(errorOutput).toString("utf8"));
        }
        return output;
    } catch (error) {
        await terminateChild(child, config.terminationGraceMs, closed);
        await completed.catch(() => undefined);
        throw error;
    } finally {
        stop.dispose();
    }
}

function waitForLaunchFailure(child: ChildProcessWithoutNullStreams): Promise<never> {
    return new Promise((_resolve, reject) => {
        const failed = () => {
            child.removeListener("spawn", launched);
            reject(new ProcessVerificationSandboxError("launch-failed"));
        };
        const launched = () => child.removeListener("error", failed);
        child.once("error", failed);
        child.once("spawn", launched);
    });
}

function stopReason(signal: AbortSignal, timeoutMs: number) {
    let onAbort: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const promise = new Promise<Readonly<{ kind: "aborted" | "timeout" }>>((resolveStop) => {
        onAbort = () => resolveStop({ kind: "aborted" });
        if (signal.aborted) {
            resolveStop({ kind: "aborted" });
            return;
        }
        signal.addEventListener("abort", onAbort, { once: true });
        timer = setTimeout(() => resolveStop({ kind: "timeout" }), timeoutMs);
    });
    return {
        promise,
        dispose() {
            if (timer) {
                clearTimeout(timer);
            }
            if (onAbort) {
                signal.removeEventListener("abort", onAbort);
            }
        },
    };
}
