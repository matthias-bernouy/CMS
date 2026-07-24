export type EndpointPerformanceFlusher = {
    run(): Promise<void>;
    stop(): void;
};

export function startEndpointPerformanceFlusher(
    recorder: { flush(): Promise<void> },
    options: { intervalMs?: number; onError?: (error: unknown) => void } = {},
): EndpointPerformanceFlusher {
    const run = async () => {
        try {
            await recorder.flush();
        } catch (error) {
            options.onError?.(error);
        }
    };
    const timer = setInterval(() => void run(), options.intervalMs ?? 10_000);
    timer.unref?.();
    return {
        run,
        stop: () => clearInterval(timer),
    };
}
