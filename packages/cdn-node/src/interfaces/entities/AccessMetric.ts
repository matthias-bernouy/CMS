/**
 * One row per `(edgeId, bucketId, day)` aggregating the access-log
 * events the origin pulled from each edge. The puller's aggregation
 * step `$inc`-merges new lines into the matching row.
 *
 * `bucketId` is `""` for events that didn't resolve to a bucket — port
 * 80 redirects, 444s, etc. Worth keeping for total counting but easy to
 * filter out at query time.
 */
export type AccessMetric = {
    /** "<edgeId>:<bucketId>:<YYYY-MM-DD>" — composite primary key. */
    id:        string;
    edgeId:    string;
    bucketId:  string;
    /** UTC day, ISO format `YYYY-MM-DD`. */
    day:       string;
    requests:  number;
    bytes:     number;
    status2xx: number;
    status3xx: number;
    status4xx: number;
    status5xx: number;
    updatedAt: number;
};

/**
 * Tracks which `.gz` access-log archives have been folded into the
 * metrics aggregation, so re-running the puller doesn't double-count.
 * `_id` is `"<edgeId>:<filename>"` because filenames repeat across
 * edges (every edge has `access.log.1.gz`, `access.log.2.gz`, …).
 */
export type ProcessedLogFile = {
    id:             string;
    edgeId:         string;
    filename:       string;
    /** ms epoch — when we processed it. */
    processedAt:    number;
    /** Number of JSON-Lines events folded into the aggregates. */
    lineCount:      number;
    /** Sum of `bytes` across the file (sanity check). */
    bytesProcessed: number;
};
