import { assertCondition, requireRecord } from "../../queries/types";

export function assertClusterRead(
    capability: string,
    output: unknown,
    instanceId: string,
    ids: readonly string[],
    durations: readonly number[],
) {
    const value = requireRecord(output);
    assertCondition(value.partial === false, "cluster-log-incomplete-source");
    assertCondition(Array.isArray(value.sources) && value.sources.length === 1);
    assertCondition(
        requireRecord(value.sources[0]).instanceId === instanceId &&
            requireRecord(value.sources[0]).status === "available",
    );
    if (capability === "logs.query") {
        assertCondition(Array.isArray(value.items) && value.items.length === ids.length);
        const actual = value.items.map((item) => {
            const row = requireRecord(item);
            assertCondition(row.instanceId === instanceId && !Object.hasOwn(row, "attributes"));
            return String(row.id);
        });
        assertCondition(new Set(actual).size === ids.length && ids.every((id) => actual.includes(id)));
        assertCondition(value.nextCursor === null);
    } else if (capability === "logs.get") {
        const entry = requireRecord(value.entry);
        assertCondition(entry.instanceId === instanceId && entry.id === ids.at(-1));
        assertCondition(requireRecord(entry.attributes).password === "[REDACTED]");
    } else if (capability === "logs.aggregate") {
        assertCondition(
            value.total === ids.length &&
                value.truncated === false &&
                Array.isArray(value.groups) &&
                value.groups.length === 1,
        );
        const group = requireRecord(value.groups[0]);
        assertCondition(group.key === "info" && group.count === ids.length);
    } else {
        assertCondition(value.method === "histogram-upper-bound-v1" && Array.isArray(value.points));
        const count = value.points.reduce((sum, point) => sum + Number(requireRecord(point).count), 0);
        assertCondition(count === ids.length);
        const sorted = [...durations].sort((a, b) => a - b);
        const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
        // Fixture durations occupy one UTC hour; the oracle checks actual percentile precision.
        assertCondition(value.points.length === 1);
        const point = requireRecord(value.points[0]);
        assertCondition(Number(point.p95Ms) >= p95 && Number(point.p95Ms) <= p95 * 1.1);
        assertCondition(Math.abs(Number(point.meanMs) - durations.reduce((a, b) => a + b, 0) / count) < 0.000001);
    }
}
