/**
 * Maps one AnalyticsEvent to the list of counter upserts it produces. Pure and
 * testable: it returns plain rollup descriptors, the Mongo layer turns them into
 * bulkWrite ops. Bots produce no writes — they are excluded from view/visitor counters.
 */

import type { AnalyticsEvent } from "../interfaces/AnalyticsEvent";
import { truncateToHour, hourKey, rollupId } from "./buckets";

/** One counter upsert: $inc count (+ msSum), $max msMax, on a deterministic _id. */
export type RollupUpsert = {
    id: string;
    metric: string;
    dim: string;
    key: string;
    bucket: Date;
    count: number;
    msSum?: number;
    msMax?: number;
};

/** Whether an event counts toward views/visitors. Bots are excluded (V1). PURE. */
export const isCountedEvent = (event: AnalyticsEvent): boolean => event.device !== 'bot';

/**
 * Page-view event → its rollup upserts. PURE.
 * Always: pv|all, pv|path, pv|status, pv|device, pv|browser.
 * Plus, on same-origin internal navigation (fromPath set and ≠ path): flow|edge|from>to.
 */
export function eventToWrites(event: AnalyticsEvent): RollupUpsert[] {
    if (!isCountedEvent(event)) return [];
    const bucket = truncateToHour(event.ts);
    const tk = hourKey(event.ts);
    const pv = (dim: string, key: string, extra?: Partial<RollupUpsert>): RollupUpsert => ({
        id: rollupId('pv', dim, key, tk), metric: 'pv', dim, key, bucket, count: 1, ...extra,
    });
    const writes: RollupUpsert[] = [
        pv('all', '_', { msSum: event.durationMs, msMax: event.durationMs }),
        pv('path', event.path),
        pv('status', String(event.status)),
        pv('device', event.device),
        pv('browser', event.browser),
    ];
    if (event.fromPath && event.fromPath !== event.path) {
        const key = `${event.fromPath}>${event.path}`;
        writes.push({ id: rollupId('flow', 'edge', key, tk), metric: 'flow', dim: 'edge', key, bucket, count: 1 });
    }
    return writes;
}
