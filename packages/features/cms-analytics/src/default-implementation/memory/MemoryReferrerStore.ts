import { hourKey, truncateToHour } from "../../core/rollups/buckets";
import {
    aggregateFrequentItems,
    emptyFrequentItems,
    updateFrequentItems,
    type FrequentItemsSnapshot,
} from "../../core/referrers/FrequentItems";

export class MemoryReferrerStore {
    private readonly buckets = new Map<string, { bucket: Date; snapshot: FrequentItemsSnapshot }>();

    constructor(private readonly capacity: number) {}

    record(ts: Date, domain: string): void {
        const key = hourKey(ts);
        const current = this.buckets.get(key);
        this.buckets.set(key, {
            bucket: current?.bucket ?? truncateToHour(ts),
            snapshot: updateFrequentItems(current?.snapshot ?? emptyFrequentItems(), domain, this.capacity),
        });
    }

    read(from: Date, to: Date): Array<{ key: string; count: number }> {
        return aggregateFrequentItems(
            [...this.buckets.values()]
                .filter((bucket) => bucket.bucket >= from && bucket.bucket < to)
                .map((bucket) => bucket.snapshot),
        );
    }

    saturated(from: Date, to: Date): boolean {
        return [...this.buckets.values()].some(
            (bucket) => bucket.bucket >= from && bucket.bucket < to && bucket.snapshot.saturated,
        );
    }
}
