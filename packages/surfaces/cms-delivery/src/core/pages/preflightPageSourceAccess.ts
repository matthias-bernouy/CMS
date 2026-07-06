import type DeliveryCms from "cms-delivery/DeliveryCms";
import type { TPage } from "@bernouy/cms-content";
import { collectCmsSourceBindings } from "@bernouy/cms-content";
import {
    isSourceAuthorized,
    resolveEndpoint,
    sourceAuthorizationStatus,
    sourcesPrefix,
} from "@bernouy/cms-sources";
import {
    authorizeDeliverySourceEndpoint,
    resolveDeliverySubject,
} from "cms-delivery/core/sources/authorization";

export async function preflightPageSourceAccess(
    req: Request,
    page: TPage,
    delivery: DeliveryCms,
): Promise<Response | null> {
    const sources = delivery.sources;
    if (!sources) return null;

    const bindings = collectCmsSourceBindings(page.content);
    if (bindings.length === 0) return null;

    const requestUrl = new URL(req.url);
    const prefix = sourcesPrefix(delivery.runner.basePath);
    const subject = await resolveDeliverySubject(delivery, req);

    for (const binding of bindings) {
        if (binding.trigger === "submit") continue;

        const segments = sourceSegments(binding.url, requestUrl, prefix);
        if (!segments) continue;

        // Auto sources are fetched by the binding runtime with GET. Submit
        // sources are action-time checks and are handled by the proxy itself.
        const resolved = await resolveEndpoint(sources, segments, "GET");
        if (!resolved.ok) continue;

        const authorization = await authorizeDeliverySourceEndpoint(delivery, resolved.endpoint, req, { subject });
        if (isSourceAuthorized(authorization)) continue;

        return sourceAccessDenied(req, delivery, sourceAuthorizationStatus(authorization));
    }

    return null;
}

function sourceSegments(rawUrl: string, requestUrl: URL, prefix: string): string[] | null {
    let url: URL;
    try {
        url = new URL(rawUrl, requestUrl);
    } catch {
        return null;
    }

    if (url.origin !== requestUrl.origin || !url.pathname.startsWith(prefix)) return null;

    try {
        return url.pathname.slice(prefix.length).split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
        return null;
    }
}

function sourceAccessDenied(req: Request, delivery: DeliveryCms, status: 401 | 403): Response {
    if (status === 401 && delivery.auth) {
        const url = new URL(req.url);
        return new Response(null, {
            status: 302,
            headers: {
                Location: delivery.auth.local.buildLoginUrl(`${url.pathname}${url.search}`),
            },
        });
    }

    return new Response(status === 401 ? "Unauthorized" : "Forbidden", { status });
}
