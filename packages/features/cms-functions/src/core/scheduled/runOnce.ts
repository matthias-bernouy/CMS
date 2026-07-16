import { executeFunction } from "../executeFunction";
import type {
    ScheduledFunctionLogger,
    ScheduledFunctionRunContext,
    ScheduledFunctionRunResult,
    ScheduledSystemFunctionJob,
    ScheduledSystemFunctionRunnerOptions,
} from "./types";

export const DEFAULT_SCHEDULED_FUNCTION_LOGGER: ScheduledFunctionLogger = {
    info: message => console.info(message),
    warn: message => console.warn(message),
    error: message => console.error(message),
};

export async function runScheduledSystemFunctionOnce(
    options: Pick<ScheduledSystemFunctionRunnerOptions, "functions" | "sources" | "deps">,
    job: ScheduledSystemFunctionJob,
    context: ScheduledFunctionRunContext,
    logger: ScheduledFunctionLogger = DEFAULT_SCHEDULED_FUNCTION_LOGGER,
    now: () => Date = () => new Date(),
): Promise<ScheduledFunctionRunResult> {
    const startedMs = now().getTime();
    try {
        const fn = await options.functions.getFunction(job.functionId);
        if (!fn) return result(context, "missing", startedMs, now);
        if (fn.method !== "POST" || fn.access?.mode !== "system") {
            logger.error(`[cms-functions] scheduled job ${job.functionId} is not a system POST function`);
            return result(context, "invalid", startedMs, now);
        }
        const response = await executeFunction(fn, new Request("https://cms.internal/scheduled-function", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(job.body(context)),
        }), {
            sources: options.sources,
            deps: options.deps,
            identities: options.deps?.identities,
            user: {},
        });
        const durationMs = Math.max(0, now().getTime() - startedMs);
        if (!response.ok) {
            logger.error(`[cms-functions] scheduled job ${job.functionId} failed with status ${response.status} (${durationMs}ms)`);
            return {
                functionId: job.functionId,
                runId: context.runId,
                status: "failed",
                responseStatus: response.status,
                durationMs,
            };
        }
        logger.info(`[cms-functions] scheduled job ${job.functionId} succeeded (${durationMs}ms)`);
        return {
            functionId: job.functionId,
            runId: context.runId,
            status: "succeeded",
            responseStatus: response.status,
            durationMs,
        };
    } catch {
        const durationMs = Math.max(0, now().getTime() - startedMs);
        logger.error(`[cms-functions] scheduled job ${job.functionId} failed (${durationMs}ms)`);
        return { functionId: job.functionId, runId: context.runId, status: "failed", durationMs };
    }
}

function result(
    context: ScheduledFunctionRunContext,
    status: ScheduledFunctionRunResult["status"],
    startedMs: number,
    now: () => Date,
): ScheduledFunctionRunResult {
    return {
        functionId: context.functionId,
        runId: context.runId,
        status,
        durationMs: Math.max(0, now().getTime() - startedMs),
    };
}
