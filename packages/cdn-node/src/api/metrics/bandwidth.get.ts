import { wrapAdmin } from "../../core/admin/wrapAdmin";

/**
 * Aggregated metrics over the last 7 UTC days, drawn from the
 * pre-computed `cdn_access_metrics` collection populated by the puller.
 *
 * Response shape:
 * - `range`      → { from, to } ISO `YYYY-MM-DD`, both inclusive.
 * - `byEdge`     → list `{edgeId, bytes, requests}` sorted by bytes desc.
 * - `topBuckets` → up to 5 `{bucketId, bytes, requests}` sorted by bytes desc.
 */
export default wrapAdmin(async (_req, provider) => {
    const days = 7;
    const today = new Date();
    const from = formatDay(new Date(today.getTime() - (days - 1) * 24 * 3600 * 1000));
    const to   = formatDay(today);
    const range = { from, to };

    const [byEdge, topBuckets] = await Promise.all([
        provider.accessMetricsRepo.bytesByEdge(range),
        provider.accessMetricsRepo.topBucketsByBytes(range, 5),
    ]);
    return { range, byEdge, topBuckets };
});

function formatDay(d: Date): string {
    // toISOString returns UTC, slice trims to YYYY-MM-DD.
    return d.toISOString().slice(0, 10);
}
