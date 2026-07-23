import { dayKey, rollupId, truncateToDay } from "../../core/rollups/buckets";
import { HyperLogLogPlus } from "../../core/hll/HyperLogLogPlus";
import { ANALYTICS_VERSIONS, STRICT_ANALYTICS_LIMITS } from "../../interfaces/AnalyticsPrivacy";
import type { RollupUpsert } from "../../core/rollups/eventToWrites";

export class MemoryHllStore {
    private readonly sketches = new Map<string, HyperLogLogPlus>();
    private nextStripe = 0;

    constructor(private readonly stripes: number) {}

    record(ts: Date, visitorHash: string): void {
        const day = dayKey(ts);
        const stripe = this.nextStripe++ % this.stripes;
        const id = `${day}|${stripe}`;
        const sketch = this.sketches.get(id) ?? new HyperLogLogPlus(STRICT_ANALYTICS_LIMITS.hllPrecision);
        sketch.addHex(visitorHash);
        this.sketches.set(id, sketch);
    }

    finalize(before: Date, retentionDays: number): RollupUpsert[] {
        const closedBefore = truncateToDay(before);
        const days = new Set(
            [...this.sketches.keys()]
                .map((key) => key.slice(0, 10))
                .filter((day) => new Date(`${day}T00:00:00Z`) < closedBefore),
        );
        return [...days].map((day) => this.dayRollup(day, retentionDays));
    }

    private dayRollup(day: string, retentionDays: number): RollupUpsert {
        const merged = new HyperLogLogPlus(STRICT_ANALYTICS_LIMITS.hllPrecision);
        for (let stripe = 0; stripe < this.stripes; stripe++) {
            const sketch = this.sketches.get(`${day}|${stripe}`);
            if (sketch) {
                merged.merge(sketch);
            }
        }
        const bucket = new Date(`${day}T00:00:00.000Z`);
        return {
            id: rollupId("visitor", "estimate", ANALYTICS_VERSIONS.visitorEstimator, day),
            metric: "visitor",
            dim: "estimate",
            key: ANALYTICS_VERSIONS.visitorEstimator,
            bucket,
            count: merged.estimate(),
            expiresAt: new Date(bucket.getTime() + retentionDays * 86_400_000),
        };
    }
}
