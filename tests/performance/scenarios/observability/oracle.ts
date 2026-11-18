import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../queries/types";

export type SeededLog = Readonly<{
    entry: Readonly<Record<string, unknown>>;
    receivedAfter: number;
    receivedBefore: number;
}>;
export type LogWindow = Readonly<{ from: string; to: string }>;

export function compareLogPosition(a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>) {
    return String(b.receivedAt).localeCompare(String(a.receivedAt)) || String(b.id).localeCompare(String(a.id));
}

/** Ingestion input establishes all fields except the bounded server-generated reception time. */
export function assertLogEntry(output: unknown, seed: SeededLog, instanceId: string, detail: boolean) {
    const row = requireRecord(output);
    const receivedAt = String(row.receivedAt);
    const timestamp = Date.parse(receivedAt);
    assertCondition(
        Number.isFinite(timestamp) &&
            new Date(timestamp).toISOString() === receivedAt &&
            timestamp >= seed.receivedAfter - 1000 &&
            timestamp <= seed.receivedBefore + 1000,
        "log-read-reception-time",
    );
    const { attributes, ...entry } = seed.entry;
    const expected = {
        ...entry,
        instanceId,
        service: "cms-edge",
        receivedAt,
        ...(detail ? { attributes: { ...requireRecord(attributes), password: "[REDACTED]" } } : {}),
    };
    assertCondition(canonicalizeIJson(row) === canonicalizeIJson(expected), "log-read-exact-entry");
    return row;
}

export function assertLogQuery(
    output: unknown,
    seeds: readonly SeededLog[],
    instanceId: string,
    window: LogWindow,
    remaining: number,
) {
    const row = requireRecord(output);
    assertCondition(
        row.from === window.from &&
            row.to === window.to &&
            Array.isArray(row.items) &&
            row.items.length === Math.min(16, remaining),
        "log-read-query-window-count",
    );
    assertCondition(
        remaining > 16
            ? typeof row.nextCursor === "string" && row.nextCursor.length > 0 && row.nextCursor.length <= 1600
            : row.nextCursor === null,
        "log-read-query-cursor",
    );
    const index = new Map(seeds.map((seed) => [seed.entry.id, seed]));
    const items = row.items.map((value) => {
        const candidate = requireRecord(value);
        const seed = index.get(candidate.id);
        assertCondition(seed, "log-read-foreign-entry");
        return assertLogEntry(candidate, seed, instanceId, false);
    });
    assertCondition(
        new Set(items.map((item) => item.id)).size === items.length &&
            canonicalizeIJson(items) === canonicalizeIJson([...items].sort(compareLogPosition)),
        "log-read-query-order",
    );
    return { items, nextCursor: row.nextCursor as string | null };
}

export function assertLogAggregate(output: unknown, seeds: readonly SeededLog[], groupBy: "level" | "event" = "level") {
    const counts = new Map<string, number>();
    for (const seed of seeds) {
        const key = String(seed.entry[groupBy]);
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const groups = [...counts]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
    assertCondition(
        canonicalizeIJson(output) ===
            canonicalizeIJson({ total: seeds.length, groups: groups.slice(0, 50), truncated: groups.length > 50 }),
        "log-read-exact-aggregate",
    );
}
