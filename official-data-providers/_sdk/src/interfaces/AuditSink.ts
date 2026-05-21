/**
 * Control-plane audit (base.md §8). Append-only / immutable: implementations
 * MUST NOT expose mutation or deletion. The default runtime sink is
 * persistent; in-memory is reserved for tests (cf. .work/_sdk decisions).
 */
export type AuditOperation = "provision" | "update" | "deprovision";

export interface AuditEvent {
    /** ISO 8601 timestamp. */
    ts:        string;
    /** Calling issuer (the hub, role: control-plane). */
    callerIss: string;
    tenantId:  string;
    operation: AuditOperation;
    result:    "ok" | "error";
    detail?:   string;
}

export interface AuditSink {
    record(event: AuditEvent): Promise<void>;
}
