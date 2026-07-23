import type { AnalyticsStore } from "../../interfaces/AnalyticsStore";

const HOUR_MS = 3_600_000;

export type AnalyticsFinalizer = {
    run(): Promise<void>;
    stop(): void;
};

export function startAnalyticsFinalizer(
    store: AnalyticsStore,
    options: {
        intervalMs?: number;
        now?: () => Date;
        onError?: (error: unknown) => void;
    } = {},
): AnalyticsFinalizer {
    const now = options.now ?? (() => new Date());
    const run = async () => {
        try {
            await store.finalizeVisitors(now());
        } catch (error) {
            options.onError?.(error);
        }
    };
    const timer = setInterval(() => void run(), options.intervalMs ?? HOUR_MS);
    timer.unref?.();
    void run();
    return {
        run,
        stop: () => clearInterval(timer),
    };
}
