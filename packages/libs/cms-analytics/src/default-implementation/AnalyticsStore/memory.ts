import type { AnalyticsStore, AnalyticsSummary, TimeBucket, KeyCount, RangeQuery } from "../../interfaces/AnalyticsStore";
import type { AnalyticsEvent } from "../../interfaces/AnalyticsEvent";
import type { RollupUpsert } from "../../core/eventToWrites";
import { eventToWrites, isCountedEvent } from "../../core/eventToWrites";
import { dayKey, truncateToDay, truncateToHour, rollupId, seenId } from "../../core/buckets";

/**
 * In-memory AnalyticsStore — the dep-free reference implementation, for dev and tests.
 * Mirrors the Mongo counter semantics: same rollup buckets, same seen-dedup, JS aggregation.
 */
export class InMemoryAnalyticsStore implements AnalyticsStore {
    private _rollups = new Map<string, RollupUpsert>();   // keyed by rollup id
    private _seen = new Set<string>();                     // visitorId|day

    async init(): Promise<void> {}

    async record(event: AnalyticsEvent): Promise<void> {
        if (!isCountedEvent(event)) return;
        for (const w of eventToWrites(event)) this._merge(w);
        const sid = seenId(event.visitorId, dayKey(event.ts));
        if (!this._seen.has(sid)) {
            this._seen.add(sid);
            this._merge({ id: rollupId("uv", "all", "_", dayKey(event.ts)), metric: "uv", dim: "all", key: "_", bucket: truncateToDay(event.ts), count: 1 });
        }
    }

    private _merge(w: RollupUpsert): void {
        const cur = this._rollups.get(w.id);
        if (!cur) { this._rollups.set(w.id, { ...w }); return; }
        cur.count += w.count;
        if (w.msSum !== undefined) cur.msSum = (cur.msSum ?? 0) + w.msSum;
        if (w.msMax !== undefined) cur.msMax = Math.max(cur.msMax ?? 0, w.msMax);
    }

    private _rows(metric: string, dim: string, from: Date, to: Date): RollupUpsert[] {
        return [...this._rollups.values()].filter((r) => r.metric === metric && r.dim === dim && r.bucket >= from && r.bucket < to);
    }

    async summary(from: Date, to: Date): Promise<AnalyticsSummary> {
        const all = this._rows("pv", "all", from, to);
        const views = all.reduce((n, r) => n + r.count, 0);
        const msSum = all.reduce((n, r) => n + (r.msSum ?? 0), 0);
        const uniqueVisitors = this._rows("uv", "all", from, to).reduce((n, r) => n + r.count, 0);
        const errors = this._rows("pv", "status", from, to).filter((r) => r.key >= "400" && r.key < "600").reduce((n, r) => n + r.count, 0);
        return { views, uniqueVisitors, avgMs: views ? Math.round(msSum / views) : 0, errorRate: views ? errors / views : 0 };
    }

    async timeseries(q: RangeQuery): Promise<TimeBucket[]> {
        const trunc = q.interval === "day" ? truncateToDay : truncateToHour;
        const acc = new Map<number, { count: number; msSum: number; maxMs: number }>();
        for (const r of this._rows("pv", "all", q.from, q.to)) {
            const t = trunc(r.bucket).getTime();
            const a = acc.get(t) ?? { count: 0, msSum: 0, maxMs: 0 };
            a.count += r.count;
            a.msSum += r.msSum ?? 0;
            a.maxMs = Math.max(a.maxMs, r.msMax ?? 0);
            acc.set(t, a);
        }
        return [...acc.entries()].sort((x, y) => x[0] - y[0]).map(([t, a]) => ({ bucket: new Date(t), count: a.count, avgMs: a.count ? Math.round(a.msSum / a.count) : 0, maxMs: a.maxMs }));
    }

    topPaths(from: Date, to: Date, limit: number): Promise<KeyCount[]> { return this._top("path", from, to, limit); }
    breakdown(dim: "status" | "device" | "browser", from: Date, to: Date): Promise<KeyCount[]> { return this._top(dim, from, to, 0); }

    private async _top(dim: string, from: Date, to: Date, limit: number): Promise<KeyCount[]> {
        const byKey = new Map<string, number>();
        for (const r of this._rows("pv", dim, from, to)) byKey.set(r.key, (byKey.get(r.key) ?? 0) + r.count);
        const out = [...byKey.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
        return limit > 0 ? out.slice(0, limit) : out;
    }
}
