import type { ExecutorDeps, SourceRepository } from "@bernouy/cms-sources";
import type { FunctionRepository } from "../interfaces/FunctionRepository";
import { executeFunction } from "./executeFunction";

export type ScheduledFunctionRunContext = {
    functionId: string;
    runId: string;
    sequence: number;
    startedAt: string;
};

export type ScheduledSystemFunctionJob = {
    functionId: string;
    intervalMs: number;
    initialDelayMs?: number;
    body: (context: ScheduledFunctionRunContext) => unknown;
};

export type ScheduledFunctionRunResult = {
    functionId: string;
    runId: string;
    status: "succeeded" | "failed" | "missing" | "invalid" | "already_running";
    responseStatus?: number;
    durationMs: number;
};

export type ScheduledFunctionLogger = {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
};

export type ScheduledFunctionTimer = {
    set(callback: () => void, delayMs: number): unknown;
    clear(handle: unknown): void;
};

export type ScheduledSystemFunctionRunnerOptions = {
    functions: FunctionRepository;
    sources: SourceRepository;
    jobs: readonly ScheduledSystemFunctionJob[];
    deps?: ExecutorDeps;
    logger?: ScheduledFunctionLogger;
    timer?: ScheduledFunctionTimer;
    now?: () => Date;
    randomUUID?: () => string;
};

export type ScheduledSystemFunctionRunner = {
    runNow(functionId: string): Promise<ScheduledFunctionRunResult>;
    stop(): Promise<void>;
};

type JobState = {
    job: ScheduledSystemFunctionJob;
    sequence: number;
    timer?: unknown;
    running?: Promise<ScheduledFunctionRunResult>;
};

const defaultLogger: ScheduledFunctionLogger = {
    info: message => console.info(message),
    warn: message => console.warn(message),
    error: message => console.error(message),
};

const defaultTimer: ScheduledFunctionTimer = {
    set: (callback, delayMs) => setTimeout(callback, delayMs),
    clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function startScheduledSystemFunctions(
    options: ScheduledSystemFunctionRunnerOptions,
): ScheduledSystemFunctionRunner {
    const logger = options.logger ?? defaultLogger;
    const timer = options.timer ?? defaultTimer;
    const now = options.now ?? (() => new Date());
    const randomUUID = options.randomUUID ?? (() => crypto.randomUUID());
    const states = new Map<string, JobState>();
    let stopped = false;

    for (const job of options.jobs) {
        assertJob(job, states);
        const state: JobState = { job, sequence: 0 };
        states.set(job.functionId, state);
        schedule(state, job.initialDelayMs ?? 0);
    }

    function schedule(state: JobState, delayMs: number): void {
        if (stopped) return;
        state.timer = timer.set(() => {
            state.timer = undefined;
            void run(state).finally(() => schedule(state, state.job.intervalMs));
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

export async function runScheduledSystemFunctionOnce(
    options: Pick<ScheduledSystemFunctionRunnerOptions, "functions" | "sources" | "deps">,
    job: ScheduledSystemFunctionJob,
    context: ScheduledFunctionRunContext,
    logger: ScheduledFunctionLogger = defaultLogger,
    now: () => Date = () => new Date(),
): Promise<ScheduledFunctionRunResult> {
    const startedMs = now().getTime();
    const fn = await options.functions.getFunction(job.functionId);
    if (!fn) {
        return result(context, "missing", startedMs, now);
    }
    if (fn.method !== "POST" || fn.access?.mode !== "system") {
        logger.error(`[cms-functions] scheduled job ${job.functionId} is not a system POST function`);
        return result(context, "invalid", startedMs, now);
    }

    try {
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
            return { functionId: job.functionId, runId: context.runId, status: "failed", responseStatus: response.status, durationMs };
        }
        logger.info(`[cms-functions] scheduled job ${job.functionId} succeeded (${durationMs}ms)`);
        return { functionId: job.functionId, runId: context.runId, status: "succeeded", responseStatus: response.status, durationMs };
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

function assertJob(job: ScheduledSystemFunctionJob, states: Map<string, JobState>): void {
    if (!job.functionId.trim()) throw new Error("scheduled system function id is required");
    if (!Number.isSafeInteger(job.intervalMs) || job.intervalMs < 1_000) {
        throw new Error(`scheduled system function ${job.functionId} interval must be at least 1000ms`);
    }
    if (job.initialDelayMs !== undefined && (!Number.isSafeInteger(job.initialDelayMs) || job.initialDelayMs < 0)) {
        throw new Error(`scheduled system function ${job.functionId} initial delay must be a non-negative integer`);
    }
    if (states.has(job.functionId)) throw new Error(`duplicate scheduled system function job: ${job.functionId}`);
}
