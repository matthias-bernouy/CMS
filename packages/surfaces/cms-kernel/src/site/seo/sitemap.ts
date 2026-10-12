import type { TPage } from "@bernouy/cms-content/rendering";
import {
    executeIndexingCapability,
    localizedSitemapAlternates,
    materializeSitemapSnapshot as materializeSnapshot,
    startSitemapSnapshotRefresh as startRefresh,
    storedSitemapLocations as collectStoredLocations,
    type PageIndexingLocation,
    type SitemapMaterializationResult,
    type SitemapRefreshRunner,
} from "@bernouy/cms-seo";
import type KernelCms from "cms-kernel/KernelCms";
import { collectPublicPageProviderPaths, isKernelReservedPath } from "cms-kernel/site/pages/publicPagePaths";

export type { SitemapMaterializationResult, SitemapRefreshRunner } from "@bernouy/cms-seo";

export function materializeSitemapSnapshot(
    kernel: KernelCms,
    signal?: AbortSignal,
): Promise<SitemapMaterializationResult> {
    return materializeSnapshot(
        {
            store: kernel.sitemapStore,
            content: kernel.repository,
            listAdditionalPaths: () => collectPublicPageProviderPaths(kernel.publicPageProviders, kernel.cmsPathPrefix),
            isReservedPath: (path) => isKernelReservedPath(path, kernel.cmsPathPrefix),
            execute: (contractId, capabilityId, input) =>
                executeIndexingCapability(
                    kernel.capabilityGateway,
                    { kind: "anonymous" },
                    contractId,
                    capabilityId,
                    input,
                ),
        },
        signal,
    );
}

export async function storedSitemapLocations(
    kernel: KernelCms,
    pages: readonly TPage[],
    alternates?: ReturnType<typeof localizedSitemapAlternates>,
): Promise<PageIndexingLocation[]> {
    return collectStoredLocations(
        pages,
        await collectPublicPageProviderPaths(kernel.publicPageProviders, kernel.cmsPathPrefix),
        (path) => kernel.repository.resolvePublishedRoute(path),
        alternates,
    );
}

export function startSitemapSnapshotRefresh(
    kernel: KernelCms,
    options: {
        intervalMs?: number;
        retryIntervalMs?: number;
        reportError?: (error: unknown) => void;
    },
): SitemapRefreshRunner {
    return startRefresh((signal) => materializeSitemapSnapshot(kernel, signal), options);
}
