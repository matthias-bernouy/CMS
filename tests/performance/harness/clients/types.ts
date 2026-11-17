import type { CapabilityTarget } from "../../capabilities/types";

/** Payloads and credentials stay in memory and must never be serialized into reports. */
export type Observation = Readonly<{
    traceId: string;
    durationMs: number;
    requestBytes: number;
    responseBytes: number;
    status: number;
    validated: boolean;
    completed: boolean;
    streamConsumed: boolean;
    failure?: string;
    relatedTraces?: readonly string[];
    operation?: Readonly<{ polls: number }>;
}>;

export type ClientCall = Readonly<{
    origin: string;
    target: CapabilityTarget;
    binding: string;
    input: Readonly<Record<string, unknown>>;
    credentials: Readonly<{ cookie?: string; token?: string }>;
    assert: (output: unknown) => void | Promise<void>;
    captureHeaders?: (headers: Headers) => void;
    complete?: (
        operationId: string,
        signal: AbortSignal,
        recordPoll: (observation: Observation) => void,
    ) => Promise<unknown>;
    signal?: AbortSignal;
    timeoutMs?: number;
}>;

export type McpTool = Readonly<{ name: string; _meta: Readonly<Record<string, unknown>> }>;
