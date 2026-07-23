import type { TriggerLastRun, TriggerRecord } from "./TriggerDefinition";

export type ScheduledTriggerClaimRequest = {
    owner: string;
    now: string;
    leaseMs: number;
    limit: number;
    makeId: () => string;
};

export type ScheduledTriggerClaim = {
    trigger: TriggerRecord;
    token: string;
    owner: string;
    runId: string;
    runKey: string;
    scheduledAt: string;
    startedAt: string;
};

export type ScheduledTriggerCompletion = {
    triggerId: string;
    token: string;
    owner: string;
    finishedAt: string;
    lastRun: TriggerLastRun;
};

export type ScheduledTriggerTaskContext = {
    triggerId: string;
    runId: string;
    runKey: string;
    scheduledAt: string;
    startedAt: string;
    signal: AbortSignal;
};

export type ScheduledTriggerTaskHandler = (body: unknown, context: ScheduledTriggerTaskContext) => Promise<Response>;

export type ScheduledTriggerTaskRegistry = ReadonlyMap<string, ScheduledTriggerTaskHandler>;
