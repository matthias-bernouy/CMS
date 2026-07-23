import { buildPageViewEvent } from "@bernouy/cms-analytics";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { handlePageRequest, handlePageRequestWithResult } from "cms-delivery/core/pages/handlePageRequest";
import { analyticsOptOutCookieName, isAnalyticsCollectionAllowed } from "./privacyPreference";

/**
 * Wraps the default page handler: serve the request normally, then record a
 * page-view fire-and-forget. The store write (and the async visitor hashing) is
 * never awaited into the response path and any failure is swallowed — analytics
 * must never slow or break rendering. No-op when no analytics store is configured.
 */
export async function recordPageView(req: Request, delivery: DeliveryCms): Promise<Response> {
    const store = delivery.analytics;
    if (!store) {
        return handlePageRequest(req, delivery);
    }

    const t0 = Date.now();
    const result = await handlePageRequestWithResult(req, delivery);
    const durationMs = Date.now() - t0;
    const cookieName = analyticsOptOutCookieName(delivery.analyticsSiteScope ?? "");
    if (!isAnalyticsCollectionAllowed(req, cookieName, delivery.analyticsHonorDnt)) {
        return result.response;
    }
    void collectPageView(req, delivery, result.response, result.pageId, durationMs);
    return result.response;
}

async function collectPageView(
    req: Request,
    delivery: DeliveryCms,
    response: Response,
    pageId: string | undefined,
    durationMs: number,
): Promise<void> {
    try {
        const previousPageId = pageId ? await resolvePreviousPageId(req, delivery) : undefined;
        const event = await buildPageViewEvent(
            req,
            response.status,
            durationMs,
            delivery.analyticsVisitorSecret ?? "",
            {
                pageId,
                previousPageId,
                siteScope: delivery.analyticsSiteScope,
                trustProxy: delivery.analyticsTrustProxy,
                contentKind: pageId ? "html" : "other",
            },
        );
        await delivery.analytics?.record(event);
    } catch {
        return;
    }
}

async function resolvePreviousPageId(req: Request, delivery: DeliveryCms): Promise<string | undefined> {
    const referrer = req.headers.get("referer");
    if (!referrer) {
        return;
    }
    try {
        const referrerUrl = new URL(referrer);
        const requestUrl = new URL(req.url);
        const requestHost = req.headers.get("host") ?? requestUrl.host;
        if (
            (referrerUrl.protocol !== "http:" && referrerUrl.protocol !== "https:") ||
            referrerUrl.host !== requestHost
        ) {
            return;
        }
        const previousPage = await delivery.repository.getPublishedPage(referrerUrl.pathname);
        return previousPage?.id ?? undefined;
    } catch {
        return;
    }
}
