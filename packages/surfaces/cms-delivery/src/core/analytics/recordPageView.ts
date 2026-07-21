import { buildPageViewEvent } from "@bernouy/cms-analytics";
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
    if (!store) {
        return handlePageRequest(req, delivery);
    }

    const t0 = Date.now();
    const res = await handlePageRequest(req, delivery);
    const durationMs = Date.now() - t0;
    buildPageViewEvent(req, res.status, durationMs, delivery.analyticsSalt ?? "")
        .then((event) => store.record(event))
        .catch(() => {});
    return res;
}
