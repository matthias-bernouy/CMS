import { ControlCms } from "@bernouy/cms-control";
import { DeliveryCms, startSitemapSnapshotRefresh } from "@bernouy/cms-delivery";
import { BunRunner } from "@bernouy/http-runner";

export type ProductionSurfaceRuntime = {
    Runner: typeof BunRunner;
    Control: typeof ControlCms;
    Delivery: typeof DeliveryCms;
    startSitemapRefresh?: typeof startSitemapSnapshotRefresh;
    log: (message: string) => void;
    reportError: (message: string, error: unknown) => void;
};

export const PRODUCTION_SURFACE_RUNTIME: ProductionSurfaceRuntime = {
    Runner: BunRunner,
    Control: ControlCms,
    Delivery: DeliveryCms,
    startSitemapRefresh: startSitemapSnapshotRefresh,
    log: console.log,
    reportError: console.error,
};
