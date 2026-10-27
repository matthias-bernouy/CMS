import type { LogError, LogLevel } from "@bernouy/logging";

export interface LogEntry {
    readonly id: string;
    readonly time: string;
    readonly level: LogLevel;
    readonly event: string;
    readonly component?: string;
    readonly requestId?: string;
    readonly invocationId?: string;
    readonly contractId?: string;
    readonly capabilityId?: string;
    readonly durationMs?: number;
    readonly attributes: Readonly<Record<string, string>>;
    readonly error?: LogError;
}

export interface StoredLogEntry extends LogEntry {
    readonly instanceId: string;
    readonly sourceEntryId?: string;
    readonly service: string;
    readonly receivedAt: string;
    readonly expiresAt: string;
    readonly fingerprint: string;
}

export type LogSummary = Omit<StoredLogEntry, "attributes" | "error" | "expiresAt" | "fingerprint">;
export type LogDetail = Omit<StoredLogEntry, "expiresAt" | "fingerprint">;
export type LogGroup = "level" | "service" | "event" | "component" | "contractId" | "capabilityId";

export interface LogQuery {
    readonly timeField?: "time" | "receivedAt";
    readonly from?: string;
    readonly to?: string;
    readonly levels?: readonly LogLevel[];
    readonly minLevel?: LogLevel;
    readonly service?: string;
    readonly component?: string;
    readonly event?: string;
    readonly eventPrefix?: string;
    readonly requestId?: string;
    readonly invocationId?: string;
    readonly contractId?: string;
    readonly capabilityId?: string;
    readonly limit?: number;
    readonly cursor?: string;
}

export interface NormalizedLogQuery extends Omit<LogQuery, "from" | "to" | "limit" | "cursor"> {
    readonly from: string;
    readonly to: string;
    readonly limit: number;
}

export interface JournalPosition {
    readonly receivedAt: string;
    readonly id: string;
}

export interface JournalStore {
    append(entries: readonly StoredLogEntry[]): Promise<{ stored: number; duplicates: number }>;
    query(
        instanceId: string,
        query: NormalizedLogQuery,
        now: string,
        after?: JournalPosition,
    ): Promise<readonly StoredLogEntry[]>;
    get(instanceId: string, id: string, now: string): Promise<StoredLogEntry | null>;
    aggregate(
        instanceId: string,
        query: NormalizedLogQuery,
        groupBy: LogGroup,
        now: string,
    ): Promise<{ total: number; groups: readonly { key: string; count: number }[]; truncated: boolean }>;
}
