import type {
    ClusterAggregate,
    ClusterGet,
    ClusterJournalDirectory,
    ClusterQuery,
    LatencyQuery,
} from "observability/cluster/interfaces/ClusterJournal";
import { normalizeQuery } from "observability/core/validation";
import { clusterQueryHash, compareClusterPositions, decodeClusterCursor, encodeClusterCursor } from "./cursor";
import { ClusterLogsError } from "./errors";
import { mergeHistograms } from "./histogram";
import { readSources, selectedInstances } from "./sources";

export class ClusterLogs {
    private readonly cursorScope: string;
    constructor(
        private readonly options: {
            directory: ClusterJournalDirectory;
            cursorKey: string;
            scopeId: string;
            now?: () => Date;
        },
    ) {
        if (options.cursorKey.length < 32 || !options.scopeId) {
            throw new TypeError("Cluster logs require a host-bound cursor key and scope");
        }
        this.cursorScope = clusterQueryHash(options.scopeId);
    }
    async query(input: ClusterQuery) {
        const now = this.now();
        const { instanceIds, cursor: token, ...filters } = input;
        const ids = selectedInstances(instanceIds);
        const cursor = token
            ? decodeClusterCursor(token, this.options.cursorKey, this.cursorScope, now.getTime())
            : undefined;
        const query = normalizeQuery(filters, now, cursor);
        const hash = clusterQueryHash({ ids, query });
        if (cursor && cursor.hash !== hash) {
            throw new ClusterLogsError("INVALID_CURSOR");
        }
        const result = await readSources(
            this.options.directory,
            ids,
            (reader) => reader.query(query, now.toISOString(), cursor?.after),
            cursor?.excluded,
        );
        const rows = result.values.flat().sort(compareClusterPositions);
        const items = rows.slice(0, query.limit);
        const last = items.at(-1);
        return {
            ...this.coverage(result),
            from: query.from,
            to: query.to,
            items,
            nextCursor:
                rows.length > query.limit && last
                    ? encodeClusterCursor(
                          {
                              version: 1,
                              scope: this.cursorScope,
                              hash,
                              from: query.from,
                              to: query.to,
                              expiresAt: cursor?.expiresAt ?? now.getTime() + 900000,
                              after: { instanceId: last.instanceId, receivedAt: last.receivedAt, id: last.id },
                              excluded: result.sources.filter((source) => source.status !== "available"),
                          },
                          this.options.cursorKey,
                      )
                    : null,
        };
    }
    async get(input: ClusterGet) {
        selectedInstances([input.instanceId]);
        if (!/^[0-9a-f-]{36}$/u.test(input.id)) {
            throw new ClusterLogsError("INVALID_INPUT");
        }
        const now = this.now().toISOString();
        const result = await readSources(this.options.directory, [input.instanceId], (reader) =>
            reader.get(input.id, now),
        );
        const entry = result.values[0] ?? null;
        if (!result.partial && entry === null) {
            throw new ClusterLogsError("NOT_FOUND");
        }
        return { ...this.coverage(result), entry };
    }
    async aggregate(input: ClusterAggregate) {
        const { instanceIds, groupBy, ...filters } = input;
        const ids = selectedInstances(instanceIds);
        if (!["level", "service", "event", "component", "contractId", "capabilityId", "instanceId"].includes(groupBy)) {
            throw new ClusterLogsError("INVALID_INPUT");
        }
        const now = this.now();
        const query = normalizeQuery(filters, now);
        const result = await readSources(this.options.directory, ids, (reader) =>
            reader.aggregate(query, groupBy, now.toISOString()),
        );
        const groups = new Map<string, number>();
        let total = 0;
        for (const value of result.values) {
            total += value.total;
            for (const group of value.groups) {
                groups.set(group.key, (groups.get(group.key) ?? 0) + group.count);
            }
        }
        return {
            ...this.coverage(result),
            from: query.from,
            to: query.to,
            total,
            groups: [...groups]
                .map(([key, count]) => ({ key, count }))
                .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
                .slice(0, 50),
            truncated: groups.size > 50,
        };
    }
    async latency(input: LatencyQuery) {
        const { instanceIds, groupBy, intervalSeconds, ...filters } = input;
        const ids = selectedInstances(instanceIds);
        if (
            !filters.event ||
            !filters.service ||
            !["capabilityId", "instanceId", "service"].includes(groupBy) ||
            !Number.isSafeInteger(intervalSeconds) ||
            intervalSeconds < 60 ||
            intervalSeconds > 3600
        ) {
            throw new ClusterLogsError("INVALID_INPUT");
        }
        const now = this.now();
        const query = normalizeQuery(filters, now);
        if (Math.ceil((Date.parse(query.to) - Date.parse(query.from)) / (intervalSeconds * 1000)) > 500) {
            throw new ClusterLogsError("QUERY_TOO_LARGE");
        }
        const result = await readSources(this.options.directory, ids, (reader) =>
            reader.latency(query, groupBy, intervalSeconds, now.toISOString()),
        );
        return {
            ...this.coverage(result),
            from: query.from,
            to: query.to,
            method: "histogram-upper-bound-v1" as const,
            relativeBucketWidth: 0.1,
            minimumBucketWidthMs: 1,
            intervalSeconds,
            points: mergeHistograms(result.values.flat(), query.from, query.to, intervalSeconds),
        };
    }
    private now() {
        return this.options.now?.() ?? new Date();
    }
    private coverage(result: {
        sources: readonly {
            instanceId: string;
            status: "available" | "unavailable" | "unsupported" | "limit_exceeded";
        }[];
        partial: boolean;
    }) {
        return { sources: result.sources, partial: result.partial };
    }
}
