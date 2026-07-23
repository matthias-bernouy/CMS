import { getRequestIP } from "@bernouy/http-runner";
import { classifyUserAgent } from "./userAgent";
import { deriveVisitorHash } from "../visitor";
import { dayKey } from "../rollups/buckets";
import type { AnalyticsEvent, AnalyticsExclusionReason } from "../../interfaces/AnalyticsEvent";
import { normalizeExternalReferrer } from "../referrers/normalizeReferrer";

export type BuildPageViewEventOptions = {
    /** Stable page identity supplied by a surface after content resolution. */
    pageId?: string;
    /** Stable predecessor supplied only after resolving a same-site referrer. */
    previousPageId?: string;
    /** Tenant/site namespace included in the HMAC input. */
    siteScope?: string;
    /** Route result classification; strict content views require `html`. */
    contentKind?: AnalyticsEvent["contentKind"];
    /** Trust the first X-Forwarded-For hop. Keep false outside a trusted proxy boundary. */
    trustProxy?: boolean;
    /** Test or host clock injection. */
    now?: Date;
};

/** Assemble a minimized delivery observation from request + response facts —
 *  the collection rule of the analytics feature, shared by any serving surface. */
export async function buildPageViewEvent(
    req: Request,
    status: number,
    durationMs: number,
    secret: string,
    options: BuildPageViewEventOptions = {},
): Promise<AnalyticsEvent> {
    const url = new URL(req.url);
    const ua = req.headers.get("user-agent") ?? "";
    const classification = classifyUserAgent(ua);
    const ts = options.now ?? new Date();
    const contentKind = options.contentKind ?? "other";
    const exclusionReason = requestExclusion(req, url) ?? classification.exclusionReason;
    const successfulStatus = (status >= 200 && status < 300) || status === 304;
    const counted = !exclusionReason && contentKind === "html" && successfulStatus && Boolean(options.pageId);
    const visitorHash = counted
        ? await deriveVisitorHash({
              secret,
              siteScope: options.siteScope ?? "",
              utcDay: dayKey(ts),
              ip: clientIp(req, options.trustProxy ?? false),
              device: classification.device,
              browser: classification.browser,
          })
        : undefined;
    const referrerDomain = normalizeExternalReferrer(req.headers.get("referer"), url, req.headers.get("host"));
    return {
        type: "delivery_request",
        ts,
        status,
        durationMs,
        contentKind,
        entry: !options.previousPageId,
        device: classification.device,
        browser: classification.browser,
        ...(options.pageId ? { pageId: options.pageId } : {}),
        ...(options.previousPageId ? { previousPageId: options.previousPageId } : {}),
        ...(referrerDomain ? { referrerDomain } : {}),
        ...(visitorHash ? { visitorHash } : {}),
        ...(exclusionReason ? { exclusionReason } : {}),
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

function requestExclusion(req: Request, url: URL): AnalyticsExclusionReason | undefined {
    if (req.method !== "GET") {
        return "unsupported_method";
    }
    if (url.pathname.startsWith("/.cms/")) {
        return "system_route";
    }
    const purpose = `${req.headers.get("sec-purpose") ?? ""} ${req.headers.get("purpose") ?? ""}`.toLowerCase();
    if (purpose.includes("prerender")) {
        return "prerender";
    }
    if (purpose.includes("prefetch")) {
        return "prefetch";
    }
    return;
}
