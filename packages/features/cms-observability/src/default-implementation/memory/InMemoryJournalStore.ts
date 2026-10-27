import type {
    JournalPosition,
    JournalStore,
    LogGroup,
    NormalizedLogQuery,
    StoredLogEntry,
} from "cms-observability/interfaces/Journal";
import { ObservabilityError } from "cms-observability/core/validation";

export class InMemoryJournalStore implements JournalStore {
    readonly #entries = new Map<string, StoredLogEntry>();

    async append(entries: readonly StoredLogEntry[]) {
        let stored = 0;
        let duplicates = 0;
        for (const entry of entries) {
            const key = `${entry.instanceId}\0${entry.id}`;
            const previous = this.#entries.get(key);
            if (previous && previous.fingerprint !== entry.fingerprint) {
                throw new ObservabilityError("ENTRY_CONFLICT");
            }
            if (previous) {
                duplicates += 1;
            } else {
                this.#entries.set(key, structuredClone(entry));
                stored += 1;
            }
        }
        return { stored, duplicates };
    }

    async query(instanceId: string, query: NormalizedLogQuery, now: string, after?: JournalPosition) {
        return structuredClone(
            this.matching(instanceId, query, now)
                .filter(
                    (entry) =>
                        !after ||
                        entry.receivedAt < after.receivedAt ||
                        (entry.receivedAt === after.receivedAt && entry.id < after.id),
                )
                .sort(
                    (left, right) => right.receivedAt.localeCompare(left.receivedAt) || right.id.localeCompare(left.id),
                )
                .slice(0, query.limit + 1),
        );
    }

    async get(instanceId: string, id: string, now: string) {
        const entry = this.#entries.get(`${instanceId}\0${id}`);
        return entry && entry.expiresAt > now ? structuredClone(entry) : null;
    }

    async aggregate(instanceId: string, query: NormalizedLogQuery, groupBy: LogGroup, now: string) {
        const entries = this.matching(instanceId, query, now);
        const groups = new Map<string, number>();
        for (const entry of entries) {
            const key = String(entry[groupBy] ?? "unknown");
            groups.set(key, (groups.get(key) ?? 0) + 1);
        }
        const sorted = [...groups]
            .map(([key, count]) => ({ key, count }))
            .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
        return { total: entries.length, groups: sorted.slice(0, 50), truncated: sorted.length > 50 };
    }

    private matching(instanceId: string, query: NormalizedLogQuery, now: string): StoredLogEntry[] {
        return [...this.#entries.values()].filter(
            (entry) =>
                entry.instanceId === instanceId &&
                entry.expiresAt > now &&
                entry[query.timeField ?? "time"] >= query.from &&
                entry[query.timeField ?? "time"] < query.to &&
                (!query.levels || query.levels.includes(entry.level)) &&
                (!query.eventPrefix || entry.event.startsWith(query.eventPrefix)) &&
                (
                    [
                        "service",
                        "component",
                        "event",
                        "requestId",
                        "invocationId",
                        "contractId",
                        "capabilityId",
                    ] as const
                ).every((field) => query[field] === undefined || entry[field] === query[field]),
        );
    }
}
