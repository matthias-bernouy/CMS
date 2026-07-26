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
    const pid = child.pid;
    if (!pid) {
        await closed;
        return;
    }
    if (!processGroupExists(pid)) {
        await closed;
        return;
    }
    signalProcessGroup(pid, child, "SIGTERM");
    await waitForProcessGroupExit(pid, graceMs);
    if (processGroupExists(pid)) {
        signalProcessGroup(pid, child, "SIGKILL");
    }
    await closed;
}

function signalProcessGroup(pid: number, child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
    if (process.platform !== "win32") {
        try {
            process.kill(-pid, signal);
            return;
        } catch {
            // The process may have exited between the status check and the signal.
        }
    }
    child.kill(signal);
}

function processGroupExists(pid: number): boolean {
    if (process.platform === "win32") {
        return true;
    }
    try {
        process.kill(-pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function waitForProcessGroupExit(pid: number, graceMs: number): Promise<void> {
    const deadline = performance.now() + graceMs;
    while (processGroupExists(pid) && performance.now() < deadline) {
        await new Promise<void>((resolve) => setTimeout(resolve, Math.min(10, graceMs)));
    }
}
