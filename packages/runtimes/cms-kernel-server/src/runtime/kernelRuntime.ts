import { KernelCms } from "@bernouy/cms-kernel";
import { startSitemapSnapshotRefresh } from "@bernouy/cms-seo";
import { BunRunner } from "@bernouy/http-runner";

export type ProductionKernelRuntime = {
    Runner: typeof BunRunner;
    Kernel: typeof KernelCms;
    startSitemapRefresh?: typeof startSitemapSnapshotRefresh;
};

export const PRODUCTION_KERNEL_RUNTIME: ProductionKernelRuntime = {
    Runner: BunRunner,
    Kernel: KernelCms,
    startSitemapRefresh: startSitemapSnapshotRefresh,
};
