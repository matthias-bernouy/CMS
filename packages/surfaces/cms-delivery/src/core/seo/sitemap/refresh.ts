import type DeliveryCms from "cms-delivery/DeliveryCms";
import {
    CanonicalSiteHostNotConfiguredError,
    materializeSitemapSnapshot,
    type SitemapMaterializationResult,
} from "./materialize";

export const DEFAULT_SITEMAP_REFRESH_INTERVAL_MS = 60 * 60 * 1_000;
export const DEFAULT_SITEMAP_RETRY_INTERVAL_MS = 5 * 60 * 1_000;

export type SitemapRefreshRunner = {
    ready: Promise<SitemapMaterializationResult | null>;
    refresh(): Promise<SitemapMaterializationResult | null>;
    stop(): Promise<void>;
};

export function startSitemapSnapshotRefresh(
    delivery: DeliveryCms,
    options: {
        intervalMs?: number;
        retryIntervalMs?: number;
        reportError?: (error: unknown) => void;
    },
): SitemapRefreshRunner {
    const intervalMs = options.intervalMs ?? DEFAULT_SITEMAP_REFRESH_INTERVAL_MS;
    const retryIntervalMs = options.retryIntervalMs ?? DEFAULT_SITEMAP_RETRY_INTERVAL_MS;
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000) {
        throw new RangeError("sitemap refresh interval must be at least one second");
    }
    if (!Number.isSafeInteger(retryIntervalMs) || retryIntervalMs < 1_000) {
        throw new RangeError("sitemap retry interval must be at least one second");
    }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    let running: Promise<SitemapMaterializationResult | null> | undefined;

    const schedule = (result: SitemapMaterializationResult | null) => {
        if (!stopped) {
            timer = setTimeout(
                () => {
                    void refresh().then(schedule);
                },
                result ? intervalMs : retryIntervalMs,
            );
        }
    };
    const refresh = (): Promise<SitemapMaterializationResult | null> => {
        if (stopped) {
            return Promise.resolve(null);
        }
        if (running) {
            return running;
        }
        controller = new AbortController();
        running = materializeSitemapSnapshot(delivery, controller.signal)
            .catch((error) => {
                if (!(error instanceof CanonicalSiteHostNotConfiguredError) && !controller?.signal.aborted) {
                    options.reportError?.(error);
                }
                return null;
            })
            .finally(() => {
                controller = undefined;
                running = undefined;
            });
        return running;
    };

    const ready = refresh();
    void ready.then(schedule);
    return {
        ready,
        refresh,
        async stop() {
            stopped = true;
            if (timer) {
                clearTimeout(timer);
            }
            controller?.abort();
            await running;
        },
    };
}
