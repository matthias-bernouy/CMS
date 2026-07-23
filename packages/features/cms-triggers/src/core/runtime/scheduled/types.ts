import type { ExecutorDeps, SourceRepository } from "@bernouy/cms-sources";
import type { FunctionRepository } from "@bernouy/cms-functions";
import type { ScheduledTriggerTaskRegistry } from "../../../interfaces/ScheduledTrigger";
import type { TriggerRepository } from "../../../interfaces/TriggerRepository";

export type ScheduledTriggerRunStatus =
    | "succeeded"
    | "failed"
    | "missing"
    | "invalid"
    | "disabled"
    | "already_running"
    | "lost_claim";

export type ScheduledTriggerRunResult = {
    triggerId: string;
    runId: string;
    status: ScheduledTriggerRunStatus;
    responseStatus?: number;
    durationMs: number;
};

export type ScheduledTriggerLogger = {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
};

export type ScheduledTriggerTimer = {
    set(callback: () => void, delayMs: number): unknown;
    clear(handle: unknown): void;
};

export type ScheduledTriggerRunnerOptions = {
    triggers: TriggerRepository;
    functions: FunctionRepository;
    sources: SourceRepository;
    deps?: ExecutorDeps;
    tasks?: ScheduledTriggerTaskRegistry;
    workerId?: string;
    pollMs?: number;
    claimLimit?: number;
    logger?: ScheduledTriggerLogger;
    timer?: ScheduledTriggerTimer;
    now?: () => Date;
    randomUUID?: () => string;
};

export type ScheduledTriggerRunner = {
    ready: Promise<void>;
    runNow(triggerId: string): Promise<ScheduledTriggerRunResult>;
    stop(): Promise<void>;
};
