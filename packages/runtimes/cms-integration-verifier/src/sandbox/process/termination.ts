import type { ChildProcessWithoutNullStreams } from "node:child_process";

export type ChildCloseStatus = Readonly<{
    code: number | null;
    signal: NodeJS.Signals | null;
    launchError: boolean;
}>;

export function observeChildClose(child: ChildProcessWithoutNullStreams): Promise<ChildCloseStatus> {
    if (child.exitCode !== null || child.signalCode !== null) {
        return Promise.resolve({ code: child.exitCode, signal: child.signalCode, launchError: false });
    }
    return new Promise((resolve) => {
        let launchError = false;
        child.once("error", () => {
            launchError = true;
        });
        child.once("close", (code, signal) => resolve({ code, signal, launchError }));
    });
}

export async function terminateChild(
    child: ChildProcessWithoutNullStreams,
    graceMs: number,
    closed = observeChildClose(child),
): Promise<void> {
    if (!child.pid) {
        await closed;
        return;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
        await closed;
        return;
    }
    signalProcessGroup(child, "SIGTERM");
    await Promise.race([closed, delay(graceMs)]);
    if (child.exitCode === null && child.signalCode === null) {
        signalProcessGroup(child, "SIGKILL");
        await closed;
    }
}

function signalProcessGroup(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
    const pid = child.pid;
    if (process.platform !== "win32" && Number.isSafeInteger(pid) && (pid as number) > 0) {
        try {
            process.kill(-(pid as number), signal);
            return;
        } catch {
            // The process may have exited between the status check and the signal.
        }
    }
    child.kill(signal);
}

async function delay(durationMs: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}
