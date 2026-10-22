import {
    materializeSitemapSnapshot,
    type SitemapMaterializationContext,
    type SitemapMaterializationResult,
} from "./materialize";
import { startSitemapSnapshotRefresh, type SitemapRefreshRunner } from "./refresh";

export type SitemapRefreshOptions = {
    intervalMs?: number;
    retryIntervalMs?: number;
    reportError?: (error: unknown) => void;
};

export type SitemapService = {
    materialize(signal?: AbortSignal): Promise<SitemapMaterializationResult>;
    start(options?: SitemapRefreshOptions): SitemapRefreshRunner;
};

/** Bind sitemap materialization and refresh to one site's injected dependencies. */
export function createSitemapService(context: SitemapMaterializationContext): SitemapService {
    const materialize = (signal?: AbortSignal) => materializeSitemapSnapshot(context, signal);
    return {
        materialize,
        start: (options = {}) => startSitemapSnapshotRefresh(materialize, options),
    };
}
