import type { LogRecord, LogKind, LogLevel } from "src/types/LogRecord";

export interface LogQuery {
    tenantId?: string | null;
    kind?:     LogKind;
    level?:    LogLevel;
    sinceTs?:  string;          // ISO, inclusive
    untilTs?:  string;          // ISO, exclusive
    /** Bounded by the store (base.md §10.5 — no dump). */
    limit?:    number;
    cursor?:   string;
}

export interface LogPage {
    items:      LogRecord[];
    nextCursor?: string;
}

/**
 * Queryable, append-only store (base.md §10). Retrieval is paginated and
 * bounded by construction. Backend/retention NOT standardized (§10.4); the
 * default is in-memory (tests) — a persistent queryable default is wired at
 * deploy time (same stance as the Mongo registry; no Mongo test harness).
 */
export interface LogStore {
    append(record: LogRecord): Promise<void>;
    query(q: LogQuery): Promise<LogPage>;
}
