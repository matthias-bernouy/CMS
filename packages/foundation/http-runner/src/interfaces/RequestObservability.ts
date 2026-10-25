/** Immutable aggregate of timing durations recorded for one request. */
export type RequestTimingSnapshot = Readonly<Record<string, number>>;

/** Immutable aggregate of timing sample counts recorded for one request. */
export type RequestTimingCounts = Readonly<Record<string, number>>;

/** Clock seam used by deterministic timing tests. */
export type RequestTimingClock = () => number;
