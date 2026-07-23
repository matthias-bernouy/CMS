import type { AnalyticsReports, AnalyticsReportWindow } from "../core/reporting/types";

export const ANALYTICS_ROUTES = {
    summary: "/analytics/summary",
    timeseries: "/analytics/timeseries",
    topPages: "/analytics/top-pages",
    entries: "/analytics/entries",
    breakdown: "/analytics/breakdown",
    referrers: "/analytics/referrers",
    flows: "/analytics/flows",
    health: "/analytics/health",
} as const;

export async function analyticsSummaryHandler(reports: AnalyticsReports, req: Request): Promise<Response> {
    const window = reportWindow(req);
    return window instanceof Response ? window : Response.json(await reports.summary(window));
}

export async function analyticsTimeseriesHandler(reports: AnalyticsReports, req: Request): Promise<Response> {
    const window = reportWindow(req);
    return window instanceof Response ? window : Response.json(await reports.timeseries(window));
}

export async function analyticsTopPagesHandler(reports: AnalyticsReports, req: Request): Promise<Response> {
    const window = reportWindow(req);
    return window instanceof Response
        ? window
        : Response.json(await reports.topPages(window, parseLimit(new URL(req.url).searchParams)));
}

export async function analyticsEntriesHandler(reports: AnalyticsReports, req: Request): Promise<Response> {
    const window = reportWindow(req);
    return window instanceof Response
        ? window
        : Response.json(await reports.entries(window, parseLimit(new URL(req.url).searchParams)));
}

export async function analyticsBreakdownHandler(reports: AnalyticsReports, req: Request): Promise<Response> {
    const params = new URL(req.url).searchParams;
    const dimension = params.get("dim");
    if (
        dimension !== "status" &&
        dimension !== "device" &&
        dimension !== "browser" &&
        dimension !== "exclusion" &&
        dimension !== "latency"
    ) {
        return new Response("dim must be status|device|browser|exclusion|latency", { status: 400 });
    }
    const window = parseWindow(params.get("range"));
    return window ? Response.json(await reports.breakdown(dimension, window)) : invalidWindow();
}

export async function analyticsReferrersHandler(reports: AnalyticsReports, req: Request): Promise<Response> {
    const window = reportWindow(req);
    return window instanceof Response
        ? window
        : Response.json(await reports.referrers(window, parseLimit(new URL(req.url).searchParams)));
}

export async function analyticsFlowsHandler(reports: AnalyticsReports, req: Request): Promise<Response> {
    const window = reportWindow(req);
    return window instanceof Response
        ? window
        : Response.json(await reports.flows(window, parseLimit(new URL(req.url).searchParams)));
}

export async function analyticsHealthHandler(reports: AnalyticsReports, req: Request): Promise<Response> {
    const window = reportWindow(req);
    return window instanceof Response ? window : Response.json(await reports.health(window));
}

function reportWindow(req: Request): AnalyticsReportWindow | Response {
    return parseWindow(new URL(req.url).searchParams.get("range")) ?? invalidWindow();
}

function parseWindow(value: string | null): AnalyticsReportWindow | null {
    if (value === null) {
        return "7d";
    }
    return value === "24h" || value === "7d" || value === "30d" ? value : null;
}

function invalidWindow(): Response {
    return new Response("range must be 24h|7d|30d", { status: 400 });
}

function parseLimit(params: URLSearchParams): number {
    return Math.min(Math.max(Number(params.get("limit")) || 10, 1), 100);
}
