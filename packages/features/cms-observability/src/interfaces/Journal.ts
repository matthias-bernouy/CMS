import type { z } from "zod";
import type { logEntrySchema, logDetailSchema, logSummarySchema } from "cms-observability/schemas/entries";
import type { logQuerySchema, logGroupSchema } from "cms-observability/schemas/queries";
export type LogEntry = z.infer<typeof logEntrySchema>;

export interface StoredLogEntry extends LogEntry {
    readonly instanceId: string;
    readonly sourceEntryId?: string;
    readonly service: string;
    readonly receivedAt: string;
    readonly expiresAt: string;
    readonly fingerprint: string;
}

export type LogSummary = z.infer<typeof logSummarySchema>;
export type LogDetail = z.infer<typeof logDetailSchema>;
export type LogGroup = z.infer<typeof logGroupSchema>;
export type LogQuery = z.infer<typeof logQuerySchema>;

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
