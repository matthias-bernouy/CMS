import type { AuditSink, AuditEvent } from "src/interfaces/AuditSink";

/**
 * Default `AuditSink` for **tests only** (base.md §8 requires immutable +
 * persistent; memory is lost on restart). Structurally immutable: only
 * `record()` mutates, and `entries()` returns a copy — there is no API to
 * alter or delete an entry.
 */
export class MemoryAuditSink implements AuditSink {
    private readonly log: AuditEvent[] = [];

    async record(event: AuditEvent): Promise<void> {
        this.log.push({ ...event });
    }

    /** Read-only snapshot (tests). */
    entries(): readonly AuditEvent[] {
        return this.log.map((e) => ({ ...e }));
    }
}
