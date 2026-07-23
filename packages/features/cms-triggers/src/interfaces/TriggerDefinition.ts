import type { FunctionCondition, FunctionValue } from "@bernouy/cms-functions";

export type TriggerEventPhase = "request" | "response";
export type TriggerMode = "sync" | "async";
export type TriggerFailureMode = "block" | "ignore";
export type TriggerValue = FunctionValue;

export type TriggerEndpointEvent = {
    kind: "endpoint";
    source?: string;
    endpoint?: string;
    phase: TriggerEventPhase;
};

export type TriggerScheduleEvent = {
    kind: "schedule";
    intervalMs: number;
    initialDelayMs?: number;
    timeoutMs?: number;
};

export type TriggerEvent = TriggerEndpointEvent | TriggerScheduleEvent;

export type TriggerFunctionCall = {
    id: string;
    params?: Record<string, TriggerValue>;
    body?: TriggerValue;
};

export type TriggerTaskCall = {
    id: string;
    body?: TriggerValue;
};

type TriggerTarget = { function: TriggerFunctionCall; task?: never } | { function?: never; task: TriggerTaskCall };

export type TriggerDefinition = {
    id: string;
    label?: string;
    critical?: boolean;
    event: TriggerEvent;
    mode?: TriggerMode;
    failureMode?: TriggerFailureMode;
    condition?: FunctionCondition;
} & TriggerTarget;

export type TriggerLastRun = {
    at: string;
    status: "ok" | "error" | "skipped";
    error?: string;
    runId?: string;
    scheduledAt?: string;
    durationMs?: number;
    responseStatus?: number;
};

export type TriggerScheduleRunning = {
    runId: string;
    scheduledAt: string;
    startedAt: string;
    expiresAt: string;
};

export type TriggerScheduleState = {
    nextRunAt: string;
    running?: TriggerScheduleRunning;
};

export type TriggerRecord = TriggerDefinition & {
    enabled: boolean;
    lastRun?: TriggerLastRun;
    scheduleState?: TriggerScheduleState;
};

export type TriggerDto = TriggerDefinition;
