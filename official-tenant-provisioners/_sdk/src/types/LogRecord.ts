/** base.md §10.2. Two orthogonal axes, both NON-extensible by the provider. */
export type LogLevel  = "debug" | "info" | "warn" | "error";
export type LogKind   = "security" | "audit" | "request";
export type LogActor  = "anonymous" | "tenant" | "control-plane" | "system";
export type LogVisibility = "control-plane" | "tenant" | "both";

/** What a caller supplies; the Recorder fills `schemaVersion`/`ts`/`requestId`. */
export interface LogInput {
    kind:        LogKind;
    level:       LogLevel;
    event:       string;            // MUST be in the versioned catalog
    tenantId:    string | null;     // field mandatory; value may be null
    actor:       LogActor;
    visibility:  LogVisibility;
    requestId?:  string;
    outcome?:    "allow" | "deny" | "ok" | "error";
    iss?:        string;
    sub?:        string;
    ctx?:        Record<string, unknown>;
}

export interface LogRecord extends LogInput {
    schemaVersion: string;
    ts:            string;          // UTC ISO 8601 ms
    providerId:    string;
    requestId:     string;          // always present once recorded
}
