import type { ClusterJournalReader, ClusterSource, LogSummary } from "./types";
import { ClusterLogs, ClusterSourceError } from "@bernouy/observability/cluster";

export const window = { from: "2026-11-21T10:00:00.000Z", to: "2026-11-21T11:00:00.000Z" };
export const cursorKey = "cluster-test-cursor-secret-at-least-32-characters";
export function row(instanceId: string, index: number): LogSummary {
    return {
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        instanceId,
        time: "2026-11-21T10:30:00.000Z",
        receivedAt: "2026-11-21T10:30:01.000Z",
        service: "cms-edge",
        level: "info",
        event: "gateway.invocation.completed",
        durationMs: index,
        contractId: "ulvia/cms.content",
        capabilityId: "pages.get",
    };
}
export function fixture(rows: readonly LogSummary[] = []) {
    let clock = new Date(window.to);
    let active = 0;
    let maximumActive = 0;
    const counts = { opens: 0, queries: 0, loaded: 0, gets: 0, aggregates: 0, latency: 0 };
    const failures = new Map<string, ClusterSource["status"]>();
    const overrides = new Map<string, Partial<ClusterJournalReader>>();
    const directory = {
        open: async (instanceId: string): Promise<ClusterJournalReader> => {
            counts.opens++;
            active++;
            maximumActive = Math.max(maximumActive, active);
            await Promise.resolve();
            active--;
            const failed = failures.get(instanceId);
            if (failed && failed !== "available") {
                throw new ClusterSourceError(failed);
            }
            return {
                query: async (query, _now, after) => {
                    counts.queries++;
                    const values = rows
                        .filter(
                            (value) =>
                                value.instanceId === instanceId &&
                                (!after ||
                                    value.receivedAt < after.receivedAt ||
                                    (value.receivedAt === after.receivedAt &&
                                        (value.id < after.id ||
                                            (value.id === after.id && value.instanceId < after.instanceId)))),
                        )
                        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.id.localeCompare(a.id))
                        .slice(0, query.limit + 1);
                    counts.loaded += values.length;
                    return values;
                },
                get: async (id) => {
                    counts.gets++;
                    const value = rows.find((value) => value.instanceId === instanceId && value.id === id);
                    return value ? { ...value, attributes: { note: "safe" } } : null;
                },
                aggregate: async () => {
                    counts.aggregates++;
                    const count = rows.filter((row) => row.instanceId === instanceId).length;
                    return { total: count, groups: count ? [{ key: "info", count }] : [] };
                },
                latency: async () => {
                    counts.latency++;
                    return [];
                },
                ...overrides.get(instanceId),
            };
        },
    };
    const service = new ClusterLogs({ directory, cursorKey, scopeId: "test-host", now: () => clock });
    return {
        service,
        directory,
        counts,
        failures,
        overrides,
        maximumActive: () => maximumActive,
        setTime: (value: string) => {
            clock = new Date(value);
        },
    };
}
