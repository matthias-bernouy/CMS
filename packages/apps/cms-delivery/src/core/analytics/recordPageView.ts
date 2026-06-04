import { getRequestIP } from "@bernouy/core";
import { classifyUserAgent, dailySalt, visitorId, dayKey } from "@bernouy/cms-analytics";
import type { AnalyticsEvent } from "@bernouy/cms-analytics";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { handlePageRequest } from "cms-delivery/core/pages/handlePageRequest";

/**
 * Wraps the default page handler: serve the request normally, then record a
 * page-view fire-and-forget. The store write (and the async visitor hashing) is
 * never awaited into the response path and any failure is swallowed — analytics
 * must never slow or break rendering. No-op when no analytics store is configured.
 */
export async function recordPageView(req: Request, delivery: DeliveryCms): Promise<Response> {
    const store = delivery.analytics;
    if (!store) return handlePageRequest(req, delivery);

    const t0 = Date.now();
    const res = await handlePageRequest(req, delivery);
    const durationMs = Date.now() - t0;
    buildPageViewEvent(req, res.status, durationMs, delivery.analyticsSalt ?? "")
        .then((event) => store.record(event))
        .catch(() => {});
    return res;
}

/** Assemble an AnalyticsEvent from the request + response facts. Exported for tests. */
export async function buildPageViewEvent(req: Request, status: number, durationMs: number, secret: string): Promise<AnalyticsEvent> {
    const url = new URL(req.url);
    const ua = req.headers.get("user-agent") ?? "";
    const { device, browser } = classifyUserAgent(ua);
    const ts = new Date();
    const salt = await dailySalt(secret, dayKey(ts));
    return {
        type: "pageview",
        ts,
        path: url.pathname,
        status,
        durationMs,
        visitorId: await visitorId(clientIp(req), ua, salt),
        device,
        browser,
        ...referer(req, url),
    };
}

/** Client IP for the visitor hash. Behind the reverse proxy the TCP peer is the
 *  proxy itself, so prefer the first X-Forwarded-For hop; fall back to the peer. */
function clientIp(req: Request): string {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    return getRequestIP(req) ?? "";
}

/** External referer → referrerHost; same-origin referer → fromPath (internal nav). */
function referer(req: Request, url: URL): { referrerHost?: string; fromPath?: string } {
    const ref = req.headers.get("referer");
    if (!ref) return {};
    try {
        const host = req.headers.get("host") ?? url.host;
        const r = new URL(ref);
        return r.host === host ? { fromPath: r.pathname } : { referrerHost: r.host };
    } catch {
        return {};
    }
}
