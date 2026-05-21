import type { LogQuery, LogPage } from "src/interfaces/LogStore";
import type { LogRecord } from "src/types/LogRecord";

/** Page-size bounds (base.md §10.5: "no dump"). Shared by every LogStore
 *  impl so the bounded-pagination guarantee can't drift per backend. */
export const MAX_LIMIT     = 200;
export const DEFAULT_LIMIT = 100;

/** Apply the filter half of a `LogQuery` to an in-memory list. */
export function filterRecords(recs: readonly LogRecord[], q: LogQuery): LogRecord[] {
    return recs.filter((r) =>
        (q.tenantId === undefined || r.tenantId === q.tenantId) &&
        (q.kind     === undefined || r.kind === q.kind) &&
        (q.level    === undefined || r.level === q.level) &&
        (q.sinceTs  === undefined || r.ts >= q.sinceTs) &&
        (q.untilTs  === undefined || r.ts <  q.untilTs));
}

/** Stable per-record key `<ts> <requestId>`: `ts` orders chronologically,
 *  `requestId` (unique) breaks ties deterministically. */
function keyOf(r: LogRecord): string { return `${r.ts} ${r.requestId}`; }

/**
 * Keyset (cursor) pagination. The cursor is the last returned record's key,
 * NOT a positional offset — so a record appended between two page fetches
 * (newer key) never shifts an already-returned page (no skip / duplicate).
 * Records are sorted by key, then everything strictly after the cursor is
 * taken up to `limit`.
 */
export function paginate(filtered: readonly LogRecord[], q: LogQuery): LogPage {
    const limit = Math.min(Math.max(1, q.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
    const sorted = [...filtered].sort((a, b) => {
        const ka = keyOf(a), kb = keyOf(b);
        return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    const after = q.cursor ? sorted.filter((r) => keyOf(r) > q.cursor!) : sorted;
    const items = after.slice(0, limit);
    return after.length > items.length
        ? { items, nextCursor: keyOf(items[items.length - 1]!) }
        : { items };
}
