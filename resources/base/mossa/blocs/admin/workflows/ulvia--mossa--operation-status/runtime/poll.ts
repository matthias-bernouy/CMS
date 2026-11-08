import { OperationReadFailure, readOperation } from "./request";
import type { Operation } from "./request";

type Timer = ReturnType<typeof setTimeout>;
export type OperationPollRuntime = {
    now(): number;
    set(callback: () => void, delay: number): Timer;
    clear(timer: Timer): void;
    read(id: string, signal: AbortSignal): Promise<Operation>;
};
type Feedback = {
    busy(value: boolean): void;
    render(value: Operation): void;
    unavailable(retrying: boolean): void;
    limit(): void;
};
const defaults: OperationPollRuntime = {
    now: () => performance.now(),
    set: (callback, delay) => setTimeout(callback, delay),
    clear: (timer) => clearTimeout(timer),
    read: readOperation,
};

export function watchOperation(id: string, feedback: Feedback, runtime = defaults): () => void {
    const deadline = runtime.now() + 120_000;
    let active = true;
    let count = 0;
    let failures = 0;
    let request: AbortController | null = null;
    let timer: Timer | null = null;
    let requestTimer: Timer | null = null;
    const schedule = (delay: number): boolean => {
        if (!active || count >= 40 || runtime.now() + delay >= deadline) {
            return false;
        }
        timer = runtime.set(() => {
            timer = null;
            void load();
        }, delay);
        return true;
    };
    const load = async (): Promise<void> => {
        if (!active || request) {
            return;
        }
        if (count >= 40 || runtime.now() >= deadline) {
            feedback.limit();
            return;
        }
        const controller = new AbortController();
        request = controller;
        const timeout = runtime.set(() => controller.abort(), Math.max(1, Math.min(12_000, deadline - runtime.now())));
        requestTimer = timeout;
        count++;
        feedback.busy(true);
        try {
            const operation = await runtime.read(id, controller.signal);
            if (!active || request !== controller) {
                return;
            }
            failures = 0;
            feedback.render(operation);
            if ((operation.status === "queued" || operation.status === "running") && !schedule(1500)) {
                feedback.limit();
            }
        } catch (error) {
            if (active && request === controller) {
                failures++;
                const transient =
                    (error instanceof OperationReadFailure && error.retryable) ||
                    (error instanceof DOMException && error.name === "AbortError");
                const delay = Math.max(
                    error instanceof OperationReadFailure ? error.retryAfterMs : 0,
                    Math.min(10_000, 2000 * 2 ** (failures - 1)),
                );
                feedback.unavailable(transient && failures <= 6 && schedule(delay));
            }
        } finally {
            runtime.clear(timeout);
            if (requestTimer === timeout) {
                requestTimer = null;
            }
            if (active && request === controller) {
                request = null;
                feedback.busy(false);
            }
        }
    };
    void load();
    return () => {
        active = false;
        request?.abort();
        request = null;
        if (timer !== null) {
            runtime.clear(timer);
            timer = null;
        }
        if (requestTimer !== null) {
            runtime.clear(requestTimer);
            requestTimer = null;
        }
    };
}
