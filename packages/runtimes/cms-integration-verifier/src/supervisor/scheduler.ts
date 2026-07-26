import type { VerificationRenewalScheduler } from "./types";

export function createDefaultVerificationRenewalScheduler(): VerificationRenewalScheduler {
    return Object.freeze({
        now: () => Date.now(),
        sleep(durationMs: number, signal: AbortSignal): Promise<void> {
            if (signal.aborted) {
                return Promise.resolve();
            }
            return new Promise((resolve) => {
                const timer = setTimeout(finish, durationMs);
                signal.addEventListener("abort", finish, { once: true });
                function finish() {
                    clearTimeout(timer);
                    signal.removeEventListener("abort", finish);
                    resolve();
                }
            });
        },
    });
}
