import { lstat } from "node:fs/promises";
let paused = false;
/** One process-level probe; request dispatch and recovery read only the cached boolean. */
export function maintenancePaused() {
    return paused;
}
export async function startMaintenanceProbe(file?: string) {
    let pending: Promise<void> | undefined;
    const refresh = () =>
        (pending ??= (async () => {
            try {
                await lstat(file!);
                paused = true;
            } catch (error) {
                paused = (error as NodeJS.ErrnoException).code !== "ENOENT";
            }
        })().finally(() => {
            pending = undefined;
        }));
    if (!file) {
        paused = false;
        return { stop: async () => {} };
    }
    await refresh();
    const timer = setInterval(() => void refresh(), 100);
    timer.unref();
    return {
        stop: async () => {
            clearInterval(timer);
            await pending;
            paused = false;
        },
    };
}
export async function waitForMaintenanceRelease(signal: AbortSignal) {
    while (paused && !signal.aborted) {
        await Bun.sleep(100);
    }
    return !signal.aborted;
}
