import {
    startScheduledSystemFunctions,
    type FunctionRepository,
    type ScheduledSystemFunctionJob,
    type ScheduledSystemFunctionRunner,
} from "@bernouy/cms-functions";
import type { ExecutorDeps, SourceRepository } from "@bernouy/cms-sources";

export const DEV_SYSTEM_FUNCTION_JOBS: readonly ScheduledSystemFunctionJob[] = [
    worker("reconcileProtectedPaymentSystems", 5_000, 15_000, 5),
    worker("processDueOrderDeadlines", 10_000, 60_000),
    worker("dispatchPendingPaymentCancellations", 15_000, 60_000),
    worker("dispatchPendingProtectedRefunds", 20_000, 60_000),
    worker("dispatchDueProtectedSettlements", 35_000, 60_000),
    worker("reconcileMondialRelayShipmentOperations", 45_000, 60_000),
    worker("reconcileMondialRelayFulfillments", 50_000, 5 * 60_000, 8),
    worker("publishMondialRelayDeliveryHealth", 55_000, 60_000, 24),
];

export function startDevSystemFunctionWorkers(options: {
    functions: FunctionRepository;
    sources: SourceRepository;
    deps: ExecutorDeps;
}): ScheduledSystemFunctionRunner {
    return startScheduledSystemFunctions({ ...options, jobs: DEV_SYSTEM_FUNCTION_JOBS });
}

function worker(functionId: string, initialDelayMs: number, intervalMs: number, limit = 5): ScheduledSystemFunctionJob {
    return {
        functionId,
        initialDelayMs,
        intervalMs,
        body: context => ({
            runKey: `p9r-dev:${context.functionId}:${context.startedAt}:${context.runId}`,
            limit,
        }),
    };
}
