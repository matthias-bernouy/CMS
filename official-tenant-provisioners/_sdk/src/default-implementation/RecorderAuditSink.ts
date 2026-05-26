import type { AuditSink, AuditEvent } from "src/interfaces/AuditSink";
import type { Recorder } from "src/interfaces/Recorder";

const OP_EVENT: Record<AuditEvent["operation"], string> = {
    provision:   "tenant.provision",
    update:      "tenant.update",
    deprovision: "tenant.deprovision",
};

/**
 * Bridges the §8 `AuditSink` (used by provisioning) onto the
 * unified Recorder as `kind: audit` (base.md §8 ↔ §10). Audit stays on the
 * sync/durable path — `record` is awaited. Provisioning code is untouched;
 * the mount (07) injects this sink.
 */
export class RecorderAuditSink implements AuditSink {
    constructor(private readonly recorder: Recorder) {}

    async record(e: AuditEvent): Promise<void> {
        await this.recorder.record({
            kind: "audit", level: "info", event: OP_EVENT[e.operation],
            tenantId: e.tenantId, actor: "control-plane",
            visibility: "control-plane", outcome: e.result,
            iss: e.callerIss,
            ...(e.detail !== undefined ? { ctx: { detail: e.detail } } : {}),
        });
    }
}
