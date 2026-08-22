import { parseUrn, sourcesPrefix } from "@bernouy/cms-sources";
import { CMS_CORRELATION_HEADER, requestCorrelationId } from "@bernouy/http-runner";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { handleDeliverySourceRequest } from "cms-delivery/core/sources/registerSourceProxy";

export type DeliverySourceGetOptions = {
    /** Resolution keeps the visitor subject; public discovery deliberately runs anonymously. */
    forwardAuthentication?: boolean;
    /** Resolution may preserve locale negotiation; discovery must remain cache-invariant. */
    forwardLanguage?: boolean;
};

export function executeDeliverySourceGet(
    delivery: DeliveryCms,
    request: Request,
    endpointUrn: string,
    params: Readonly<Record<string, string | number>>,
    options: DeliverySourceGetOptions = {},
): Promise<Response> {
    const parsed = parseUrn(endpointUrn);
    if (!parsed?.endpoint) {
        return Promise.resolve(new Response(null, { status: 404 }));
    }

    const prefix = sourcesPrefix(delivery.runner.basePath);
    const url = new URL(request.url);
    url.pathname = `${prefix}${encodeURIComponent(parsed.source)}/${encodeURIComponent(parsed.endpoint)}`;
    url.search = "";
    for (const [name, value] of Object.entries(params)) {
        url.searchParams.set(name, String(value));
    }
    const sourceRequest = new Request(url, {
        headers: sourceRequestHeaders(
            request,
            options.forwardAuthentication !== false,
            options.forwardLanguage !== false,
        ),
        method: "GET",
        signal: request.signal,
    });
    return handleDeliverySourceRequest(delivery, sourceRequest, { prefix });
}

function sourceRequestHeaders(request: Request, forwardAuthentication: boolean, forwardLanguage: boolean): Headers {
    const headers = new Headers({ accept: "application/json" });
    const forwarded = [
        ...(forwardLanguage ? ["accept-language"] : []),
        ...(forwardAuthentication ? ["authorization", "cookie"] : []),
    ];
    for (const name of forwarded) {
        const value = request.headers.get(name);
        if (value !== null) {
            headers.set(name, value);
        }
    }
    headers.set(CMS_CORRELATION_HEADER, requestCorrelationId(request));
    return headers;
}
