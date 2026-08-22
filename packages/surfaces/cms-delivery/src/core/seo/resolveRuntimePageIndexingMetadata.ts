import { parseUrn, sourcesPrefix } from "@bernouy/cms-sources";
import type { TPage } from "@bernouy/cms-content";
import { CMS_CORRELATION_HEADER, requestCorrelationId } from "@bernouy/http-runner";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { handleDeliverySourceRequest } from "cms-delivery/core/sources/registerSourceProxy";
import {
    resolvePageIndexingMetadata,
    type PageIndexingMetadataResult,
} from "cms-delivery/core/seo/resolvePageIndexingMetadata";

export function resolveRuntimePageIndexingMetadata(
    request: Request,
    page: TPage,
    delivery: DeliveryCms,
): Promise<PageIndexingMetadataResult> {
    return resolvePageIndexingMetadata(request, page, delivery.sources, async (endpointUrn, inputParam, value) => {
        const parsed = parseUrn(endpointUrn);
        if (!parsed?.endpoint) {
            return new Response("Not Found", { status: 404 });
        }

        const prefix = sourcesPrefix(delivery.runner.basePath);
        const url = new URL(request.url);
        url.pathname = `${prefix}${encodeURIComponent(parsed.source)}/${encodeURIComponent(parsed.endpoint)}`;
        url.search = "";
        url.searchParams.set(inputParam, value);
        const sourceRequest = new Request(url, {
            headers: indexingRequestHeaders(request),
            method: "GET",
            signal: request.signal,
        });
        return handleDeliverySourceRequest(delivery, sourceRequest, { prefix });
    });
}

function indexingRequestHeaders(request: Request): Headers {
    const headers = new Headers({ accept: "application/json" });
    for (const name of ["accept-language", "authorization", "cookie"] as const) {
        const value = request.headers.get(name);
        if (value !== null) {
            headers.set(name, value);
        }
    }
    headers.set(CMS_CORRELATION_HEADER, requestCorrelationId(request));
    return headers;
}
