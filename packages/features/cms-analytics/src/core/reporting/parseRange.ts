import type { RangeQuery } from "../../interfaces/AnalyticsStore";
import { truncateToDay, truncateToHour } from "../rollups/buckets";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/**
 * Map a `?range=` token to a concrete time window + bucketing for the dashboards.
 * Unknown/missing → "7d". `now` is injected so the mapping stays pure and testable. PURE.
 */
export function parseRange(range: string | null, now: Date): RangeQuery {
    const hourlyEnd = truncateToHour(now);
    const dailyEnd = truncateToDay(now);
    switch (range) {
        case "24h":
            return { from: new Date(hourlyEnd.getTime() - 24 * HOUR_MS), to: hourlyEnd, interval: "hour" };
        case "30d":
            return { from: new Date(dailyEnd.getTime() - 30 * DAY_MS), to: dailyEnd, interval: "day" };
        case "7d":
        default:
            return { from: new Date(dailyEnd.getTime() - 7 * DAY_MS), to: dailyEnd, interval: "day" };
    }
}
