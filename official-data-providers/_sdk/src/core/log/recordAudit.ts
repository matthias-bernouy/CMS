import type { AuditSink, AuditOperation } from "src/interfaces/AuditSink";

/**
 * Build + record one immutable control-plane audit entry (base.md §8).
 * `ts` from the injected clock (deterministic tests). Audit is on the
 * sync/durable path — a failing sink propagates (durability > silence).
 */
export async function recordAudit(
    audit: AuditSink,
    now: () => number,
    e: {
        callerIss: string;
        tenantId:  string;
        operation: AuditOperation;
        result:    "ok" | "error";
        detail?:   string;
    },
): Promise<void> {
    await audit.record({
        ts: new Date(now() * 1000).toISOString(),
        callerIss: e.callerIss,
        tenantId:  e.tenantId,
        operation: e.operation,
        result:    e.result,
        ...(e.detail !== undefined ? { detail: e.detail } : {}),
    });
}
