import type { AnalyticsStore } from "../interfaces/AnalyticsStore";
import { parseRange } from "../core/parseRange";

export const ANALYTICS_ROUTES = {
    summary: "/analytics/summary",
    timeseries: "/analytics/timeseries",
    topPages: "/analytics/top-pages",
    breakdown: "/analytics/breakdown",
} as const;

export async function analyticsSummaryHandler(store: AnalyticsStore, req: Request): Promise<Response> {
    const { from, to } = parseRange(new URL(req.url).searchParams.get("range"), new Date());
    return Response.json(await store.summary(from, to));
}

export async function analyticsTimeseriesHandler(store: AnalyticsStore, req: Request): Promise<Response> {
    const q = parseRange(new URL(req.url).searchParams.get("range"), new Date());
    return Response.json(await store.timeseries(q));
}

export async function analyticsTopPagesHandler(store: AnalyticsStore, req: Request): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const { from, to } = parseRange(params.get("range"), new Date());
    const limit = Math.min(Math.max(Number(params.get("limit")) || 10, 1), 100);
    return Response.json(await store.topPaths(from, to, limit));
}

export async function analyticsBreakdownHandler(store: AnalyticsStore, req: Request): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const dim = params.get("dim");
    if (dim !== "status" && dim !== "device" && dim !== "browser") {
        return new Response("dim must be status|device|browser", { status: 400 });
    }
    const { from, to } = parseRange(params.get("range"), new Date());
    return Response.json(await store.breakdown(dim, from, to));
}
