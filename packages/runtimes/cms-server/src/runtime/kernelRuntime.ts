import { KernelCms, startSitemapSnapshotRefresh } from "@bernouy/cms-kernel";
import { BunRunner } from "@bernouy/http-runner";

export type ProductionKernelRuntime = {
    Runner: typeof BunRunner;
    Kernel: typeof KernelCms;
    startSitemapRefresh?: typeof startSitemapSnapshotRefresh;
    log: (message: string) => void;
    reportError: (message: string, error: unknown) => void;
};

export const PRODUCTION_KERNEL_RUNTIME: ProductionKernelRuntime = {
    Runner: BunRunner,
    Kernel: KernelCms,
    startSitemapRefresh: startSitemapSnapshotRefresh,
    log: console.log,
    reportError: console.error,
};
