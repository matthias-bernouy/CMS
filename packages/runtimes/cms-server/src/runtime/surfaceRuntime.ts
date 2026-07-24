import { startAnalyticsFinalizer, startEndpointPerformanceFlusher } from "@bernouy/cms-analytics";
import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms } from "@bernouy/cms-delivery";
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
    log: console.log,
    reportError: console.error,
};
