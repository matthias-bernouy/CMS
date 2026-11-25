import { NpmMetadataUnavailableError } from "./registry";

export const NPM_CONFIRMATION_WINDOW = 20 * 60 * 1000;
export type NpmConfirmationClock = {
    now: () => number;
    sleep: (milliseconds: number) => Promise<unknown>;
    report: (message: string) => void;
};
const clock: NpmConfirmationClock = {
    now: () => performance.now(),
    sleep: (milliseconds) => Bun.sleep(milliseconds),
    report: (message) => console.log(message),
};

/** Poll reads only: an accepted or uncertain write is never repeated by confirmation. */
export async function confirmNpm(
    read: (signal: AbortSignal) => Promise<boolean>,
    label: string,
    timing: NpmConfirmationClock = clock,
    cause?: unknown,
): Promise<void> {
    const started = timing.now();
    const controller = new AbortController();
    let latestError = cause;
    const unconfirmed = () =>
        new Error(
            `${label} is not confirmed after 20 minutes. Registry visibility may be delayed; retry the same phase with the same build.`,
            { cause: latestError },
        );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
            reject(unconfirmed());
            controller.abort();
        }, NPM_CONFIRMATION_WINDOW);
    });
    let delay = 1000;
    try {
        while (timing.now() - started < NPM_CONFIRMATION_WINDOW) {
            try {
                if (await Promise.race([read(controller.signal), deadline])) {
                    return;
                }
            } catch (error) {
                if (!(error instanceof NpmMetadataUnavailableError)) {
                    throw error;
                }
                latestError = error;
            }
            const remaining = NPM_CONFIRMATION_WINDOW - (timing.now() - started);
            if (remaining <= 0) {
                break;
            }
            const wait = Math.min(delay, remaining);
            timing.report(
                `${label}: waiting for registry confirmation; retry in ${wait / 1000}s (${Math.ceil(remaining / 1000)}s remaining).`,
            );
            await Promise.race([timing.sleep(wait), deadline]);
            delay = Math.min(delay * 2, 30_000);
        }
        throw unconfirmed();
    } finally {
        clearTimeout(timer);
        controller.abort();
    }
}
