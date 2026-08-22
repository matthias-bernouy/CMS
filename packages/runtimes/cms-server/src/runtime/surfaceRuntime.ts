import { startAnalyticsFinalizer, startEndpointPerformanceFlusher } from "@bernouy/cms-analytics";
import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms, startSitemapSnapshotRefresh } from "@bernouy/cms-delivery";
import { RepositoryCms } from "@bernouy/cms-repository";
import { BunRunner } from "@bernouy/http-runner";
import { startProductionScheduledTriggers } from "../scheduledTriggers";

export type ProductionSurfaceRuntime = {
    Runner: typeof BunRunner;
    Control: typeof ControlCms;
    Delivery: typeof DeliveryCms;
    Repository: typeof RepositoryCms;
    startWorkers: typeof startProductionScheduledTriggers;
    startAnalyticsFinalizer: typeof startAnalyticsFinalizer;
    startEndpointPerformanceFlusher: typeof startEndpointPerformanceFlusher;
    startSitemapRefresh?: typeof startSitemapSnapshotRefresh;
    log: (message: string) => void;
    reportError: (message: string, error: unknown) => void;
};

export const PRODUCTION_SURFACE_RUNTIME: ProductionSurfaceRuntime = {
    Runner: BunRunner,
    Control: ControlCms,
    Delivery: DeliveryCms,
    Repository: RepositoryCms,
    startWorkers: startProductionScheduledTriggers,
    startAnalyticsFinalizer,
    startEndpointPerformanceFlusher,
    startSitemapRefresh: startSitemapSnapshotRefresh,
    log: console.log,
    reportError: console.error,
};
