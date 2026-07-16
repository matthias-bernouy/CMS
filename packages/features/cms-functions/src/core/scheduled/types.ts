import type { ExecutorDeps, SourceRepository } from "@bernouy/cms-sources";
import type { FunctionRepository } from "../../interfaces/FunctionRepository";

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
