export const NO_EXTERNAL_REFERRER = "__none__";
export const OTHER_REFERRERS = "__other__";

export type FrequentItemsSnapshot = {
    total: number;
    candidates: Array<{ key: string; count: number }>;
    saturated: boolean;
};

export function emptyFrequentItems(): FrequentItemsSnapshot {
    return { total: 0, candidates: [], saturated: false };
}

/**
 * Misra-Gries admission: memory is fixed, scan noise is reduced on overflow,
 * and retained counts are conservative lower bounds.
 */
export function updateFrequentItems(
    snapshot: FrequentItemsSnapshot,
    key: string,
    capacity: number,
): FrequentItemsSnapshot {
    const candidates = snapshot.candidates.map((candidate) => ({ ...candidate }));
    const existing = candidates.find((candidate) => candidate.key === key);
    if (existing) {
        existing.count++;
    } else if (candidates.length < capacity) {
        candidates.push({ key, count: 1 });
    } else {
        for (const candidate of candidates) {
            candidate.count--;
        }
    }
    return {
        total: snapshot.total + 1,
        candidates: candidates.filter((candidate) => candidate.count > 0),
        saturated: snapshot.saturated || (!existing && snapshot.candidates.length >= capacity),
    };
}

export function aggregateFrequentItems(
    snapshots: readonly FrequentItemsSnapshot[],
): Array<{ key: string; count: number }> {
    const counts = new Map<string, number>();
    let total = 0;
    for (const snapshot of snapshots) {
        total += snapshot.total;
        for (const candidate of snapshot.candidates) {
            counts.set(candidate.key, (counts.get(candidate.key) ?? 0) + candidate.count);
        }
    }
    const retained = [...counts.values()].reduce((sum, count) => sum + count, 0);
    if (total > retained) {
        counts.set(OTHER_REFERRERS, total - retained);
    }
    return [...counts.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((left, right) => right.count - left.count);
}

export function mergeKeyCounts(
    groups: ReadonlyArray<ReadonlyArray<{ key: string; count: number }>>,
    limit: number,
): Array<{ key: string; count: number }> {
    const totals = new Map<string, number>();
    for (const group of groups) {
        for (const item of group) {
            totals.set(item.key, (totals.get(item.key) ?? 0) + item.count);
        }
    }
    const result = [...totals.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((left, right) => right.count - left.count);
    return limit > 0 ? result.slice(0, limit) : result;
}
