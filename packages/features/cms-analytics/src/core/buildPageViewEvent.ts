import { getRequestIP } from "@bernouy/http-runner";
import { classifyUserAgent } from "./userAgent";
import { dailySalt, visitorId } from "./visitor";
import { dayKey } from "./buckets";
import type { AnalyticsEvent } from "../interfaces/AnalyticsEvent";

/** Assemble a pageview `AnalyticsEvent` from the request + response facts —
 *  the collection rule of the analytics feature, shared by any serving surface. */
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
