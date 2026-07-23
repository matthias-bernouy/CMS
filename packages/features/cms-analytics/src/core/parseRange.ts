import type { RangeQuery } from "../interfaces/AnalyticsStore";
import { truncateToDay, truncateToHour } from "./rollups/buckets";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Map a `?range=` token to a concrete time window + bucketing for the dashboards.
 * Unknown/missing → "7d". `now` is injected so the mapping stays pure and testable. PURE.
 */
export function parseRange(range: string | null, now: Date): RangeQuery {
    const to = now;
    switch (range) {
        case "24h":
            return { from: new Date(truncateToHour(now).getTime() - 23 * HOUR_MS), to, interval: "hour" };
        case "30d":
            return { from: new Date(truncateToDay(now).getTime() - 29 * DAY_MS), to, interval: "day" };
        case "7d":
        default:
            return { from: new Date(truncateToDay(now).getTime() - 6 * DAY_MS), to, interval: "day" };
    }
}
