import type { Runner } from "@bernouy/core";
import type { AnalyticsStore } from "../interfaces/AnalyticsStore";
import { parseRange } from "./parseRange";

/**
 * Mount the read-only analytics API under `<base>/analytics/*` on `runner`.
 * Meant to be mounted INSIDE an app's already-guarded group (e.g. cms-control's
 * `/api` group → routes land at `/api/analytics/*`, inheriting that admin guard).
 * Mirrors `registerGatewayEndpoint`: the lib owns its HTTP surface, apps just wire it,
 * so the same store can later be exposed from more than one app without duplication.
 */
export function registerAnalyticsApi(opts: { runner: Runner; store: AnalyticsStore }): void {
    const { runner, store } = opts;

    runner.addEndpoint("GET", "/analytics/summary", async (req) => {
        const { from, to } = parseRange(new URL(req.url).searchParams.get("range"), new Date());
        return Response.json(await store.summary(from, to));
    });

    runner.addEndpoint("GET", "/analytics/timeseries", async (req) => {
        const q = parseRange(new URL(req.url).searchParams.get("range"), new Date());
        return Response.json(await store.timeseries(q));
    });

    runner.addEndpoint("GET", "/analytics/top-pages", async (req) => {
        const params = new URL(req.url).searchParams;
        const { from, to } = parseRange(params.get("range"), new Date());
        const limit = Math.min(Math.max(Number(params.get("limit")) || 10, 1), 100);
        return Response.json(await store.topPaths(from, to, limit));
    });

    runner.addEndpoint("GET", "/analytics/breakdown", async (req) => {
        const params = new URL(req.url).searchParams;
        const dim = params.get("dim");
        if (dim !== "status" && dim !== "device" && dim !== "browser") {
            return new Response("dim must be status|device|browser", { status: 400 });
        }
        const { from, to } = parseRange(params.get("range"), new Date());
        return Response.json(await store.breakdown(dim, from, to));
    });
}
