import type { LogInput } from "src/types/LogRecord";

/**
 * Single emission point (base.md §10) — replaces ad hoc `onSecurity` +
 * `AuditSink`. `record` validates synchronously (schema + catalog) then
 * persists. Durability is split by `kind` (§10.4): `audit` is
 * sync/durable (await it); `security`/`request` are best-effort — the
 * caller fires-and-forgets so the hot path never blocks.
 */
export interface Recorder {
    record(input: LogInput): Promise<void>;
}
