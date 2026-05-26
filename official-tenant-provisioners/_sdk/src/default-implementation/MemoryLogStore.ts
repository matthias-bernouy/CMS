import type { LogStore, LogQuery, LogPage } from "src/interfaces/LogStore";
import type { LogRecord } from "src/types/LogRecord";
import { filterRecords, paginate } from "src/core/log/paginate";

/**
 * Default `LogStore` — in-memory (tests). Append-only; query is filtered +
 * **bounded** (no dump, base.md §10.5). A persistent queryable default is
 * wired at deploy time (no Mongo test harness; same stance as the registry).
 */
export class MemoryLogStore implements LogStore {
    private readonly recs: LogRecord[] = [];

    async append(record: LogRecord): Promise<void> {
        this.recs.push(record);
    }

    async query(q: LogQuery): Promise<LogPage> {
        return paginate(filterRecords(this.recs, q), q);
    }
}
