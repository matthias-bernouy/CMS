import { MIN_SCHEDULED_FUNCTION_INTERVAL_MS } from "../execution/limits";
import {
    DEFAULT_SCHEDULED_FUNCTION_LOGGER,
    runScheduledSystemFunctionOnce,
} from "./runOnce";
import type {
    ScheduledFunctionLogger,
    ScheduledFunctionRunContext,
    ScheduledFunctionRunResult,
    ScheduledFunctionTimer,
    ScheduledSystemFunctionJob,
    ScheduledSystemFunctionRunner,
    ScheduledSystemFunctionRunnerOptions,
} from "./types";

type JobState = {
    job: ScheduledSystemFunctionJob;
    sequence: number;
    timer?: unknown;
    running?: Promise<ScheduledFunctionRunResult>;
};

const DEFAULT_SCHEDULED_FUNCTION_TIMER: ScheduledFunctionTimer = {
    set: (callback, delayMs) => setTimeout(callback, delayMs),
    clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function startScheduledSystemFunctions(
    options: ScheduledSystemFunctionRunnerOptions,
): ScheduledSystemFunctionRunner {
    const logger = options.logger ?? DEFAULT_SCHEDULED_FUNCTION_LOGGER;
    const timer = options.timer ?? DEFAULT_SCHEDULED_FUNCTION_TIMER;
    const now = options.now ?? (() => new Date());
    const randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
    const states = new Map<string, JobState>();
    let stopped = false;

    function schedule(state: JobState, delayMs: number): void {
        if (stopped) return;
        state.timer = timer.set(() => {
            state.timer = undefined;
            void run(state)
                .catch(() => logUnexpectedFailure(logger, state.job.functionId))
                .finally(() => schedule(state, state.job.intervalMs));
        }, delayMs);
    }

    async function run(state: JobState): Promise<ScheduledFunctionRunResult> {
        if (state.running) {
            return {
                functionId: state.job.functionId,
                runId: "",
                status: "already_running",
                durationMs: 0,
            };
        }

        state.sequence += 1;
        const started = now();
        const context: ScheduledFunctionRunContext = {
            functionId: state.job.functionId,
            runId: randomUUID(),
            sequence: state.sequence,
            startedAt: started.toISOString(),
        };
        const execution = runScheduledSystemFunctionOnce(options, state.job, context, logger, now);
        state.running = execution;
        try {
            return await execution;
        } finally {
            state.running = undefined;
        }
    }

    for (const job of options.jobs) {
        assertJob(job, states);
        states.set(job.functionId, { job, sequence: 0 });
    }
    try {
        for (const state of states.values()) schedule(state, state.job.initialDelayMs ?? 0);
    } catch (error) {
        stopped = true;
        for (const state of states.values()) {
            if (state.timer !== undefined) timer.clear(state.timer);
            state.timer = undefined;
        }
        throw error;
    }

    return {
        async runNow(functionId) {
            const state = states.get(functionId);
            if (!state) throw new Error(`scheduled system function job not found: ${functionId}`);
            return run(state);
        },
        async stop() {
            stopped = true;
            for (const state of states.values()) {
                if (state.timer !== undefined) timer.clear(state.timer);
                state.timer = undefined;
            }
            await Promise.all(Array.from(states.values(), state => state.running).filter(Boolean));
        },
    };
}

function logUnexpectedFailure(logger: ScheduledFunctionLogger, functionId: string): void {
    try {
        logger.error(`[cms-functions] scheduled job ${functionId} failed unexpectedly`);
    } catch {
        // A logger must not turn a timer callback into an unhandled rejection.
    }
}

function assertJob(job: ScheduledSystemFunctionJob, states: Map<string, JobState>): void {
    if (!job.functionId.trim()) throw new Error("scheduled system function id is required");
    if (!Number.isSafeInteger(job.intervalMs) || job.intervalMs < MIN_SCHEDULED_FUNCTION_INTERVAL_MS) {
        throw new Error(
            `scheduled system function ${job.functionId} interval must be at least ${MIN_SCHEDULED_FUNCTION_INTERVAL_MS}ms`,
        );
    }
    if (job.initialDelayMs !== undefined && (!Number.isSafeInteger(job.initialDelayMs) || job.initialDelayMs < 0)) {
        throw new Error(`scheduled system function ${job.functionId} initial delay must be a non-negative integer`);
    }
    if (states.has(job.functionId)) throw new Error(`duplicate scheduled system function job: ${job.functionId}`);
}

export { runScheduledSystemFunctionOnce } from "./runOnce";
export type {
    ScheduledFunctionLogger,
    ScheduledFunctionRunContext,
    ScheduledFunctionRunResult,
    ScheduledFunctionTimer,
    ScheduledSystemFunctionJob,
    ScheduledSystemFunctionRunner,
    ScheduledSystemFunctionRunnerOptions,
} from "./types";
