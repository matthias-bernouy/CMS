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

export type TriggerFunctionCall = {
    id: string;
    params?: Record<string, TriggerValue>;
    body?: TriggerValue;
};

export type TriggerDefinition = {
    id: string;
    label?: string;
    event: TriggerEndpointEvent;
    mode?: TriggerMode;
    failureMode?: TriggerFailureMode;
    condition?: FunctionCondition;
    function: TriggerFunctionCall;
};

export type TriggerLastRun = {
    at: string;
    status: "ok" | "error";
    error?: string;
};

export type TriggerRecord = TriggerDefinition & {
    enabled: boolean;
    lastRun?: TriggerLastRun;
};

export type TriggerDto = TriggerDefinition;
