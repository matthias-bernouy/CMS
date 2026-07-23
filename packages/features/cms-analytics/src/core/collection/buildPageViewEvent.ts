import { getRequestIP } from "@bernouy/http-runner";
import { classifyUserAgent } from "./userAgent";
import { dailySalt, visitorId } from "../visitor";
import { dayKey } from "../buckets";
import type { AnalyticsEvent } from "../../interfaces/AnalyticsEvent";

export type BuildPageViewEventOptions = {
    /** Stable page identity supplied by a surface after content resolution. */
    pageId?: string;
    /** Trust the first X-Forwarded-For hop. Keep false outside a trusted proxy boundary. */
    trustProxy?: boolean;
    /** Test or host clock injection. */
    now?: Date;
};

/** Assemble a pageview `AnalyticsEvent` from the request + response facts —
 *  the collection rule of the analytics feature, shared by any serving surface. */
export async function buildPageViewEvent(
    req: Request,
    status: number,
    durationMs: number,
    secret: string,
    options: BuildPageViewEventOptions = {},
): Promise<AnalyticsEvent> {
    if (!secret.trim()) {
        throw new Error("analytics visitor secret is required");
    }
    const url = new URL(req.url);
    const ua = req.headers.get("user-agent") ?? "";
    const { device, browser } = classifyUserAgent(ua);
    const ts = options.now ?? new Date();
    const salt = await dailySalt(secret, dayKey(ts));
    return {
        type: "pageview",
        ts,
        path: url.pathname,
        status,
        durationMs,
        visitorId: await visitorId(clientIp(req, options.trustProxy ?? true), ua, salt),
        device,
        browser,
        ...(options.pageId ? { pageId: options.pageId } : {}),
        ...referer(req, url),
    };
}

/** Client IP for the visitor hash. Behind the reverse proxy the TCP peer is the
 *  proxy itself, so prefer the first X-Forwarded-For hop; fall back to the peer. */
function clientIp(req: Request, trustProxy: boolean): string {
    const xff = trustProxy ? req.headers.get("x-forwarded-for") : null;
    if (xff) {
        return xff.split(",")[0]!.trim();
    }
    return getRequestIP(req) ?? "";
}

/** External referer → referrerHost; same-origin referer → fromPath (internal nav). */
function referer(req: Request, url: URL): { referrerHost?: string; fromPath?: string } {
    const ref = req.headers.get("referer");
    if (!ref) {
        return {};
    }
    try {
        const r = new URL(ref);
        const requestHostname = hostname(req.headers.get("host")) ?? url.hostname.toLowerCase();
        const referrerHostname = r.hostname.toLowerCase();
        return referrerHostname === requestHostname ? { fromPath: r.pathname } : { referrerHost: referrerHostname };
    } catch {
        return {};
    }
}

function hostname(host: string | null): string | null {
    if (!host) {
        return null;
    }
    try {
        return new URL(`http://${host}`).hostname.toLowerCase();
    } catch {
        return null;
    }
}
