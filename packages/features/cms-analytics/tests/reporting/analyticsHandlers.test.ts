import { describe, expect, mock, test } from "bun:test";
import { analyticsSummaryHandler } from "cms-analytics/http/analyticsHandlers";

describe("analytics report handlers", () => {
    test("accepts only fixed windows and returns the protected report envelope", async () => {
        const summary = mock(async (window: string) => ({
            data: { views: 10 },
            meta: { window, threshold: 10 },
        }));
        const reports = { summary } as never;
        const valid = await analyticsSummaryHandler(
            reports,
            new Request("https://admin.example/api/analytics/summary?range=24h"),
        );
        expect(await valid.json()).toEqual({
            data: { views: 10 },
            meta: { window: "24h", threshold: 10 },
        });
        const invalid = await analyticsSummaryHandler(
            reports,
            new Request("https://admin.example/api/analytics/summary?range=custom"),
        );
        expect(invalid.status).toBe(400);
        expect(summary).toHaveBeenCalledTimes(1);
    });
});
