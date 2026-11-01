import { snapshotRequestContext } from "cms-gateway/protocol/http/requestContext";
import type { GatewayRequestContext } from "cms-gateway/protocol/http/requestContext";
import type { ProviderCapabilityInvocationContext } from "./registry";

/** Public request metadata is separate from the authenticated transport Request. */
export interface ProviderHttpContext {
    readonly headers: Headers;
    readonly resource?: GatewayRequestContext["resource"];
    readonly transportRequest?: Request;
}

export function hydrateProviderInvocationContext(context: ProviderCapabilityInvocationContext) {
    const signal = context.signal ?? new AbortController().signal;
    const http: ProviderHttpContext = {
        headers: new Headers(context.http?.headers ?? context.headers ?? context.requestContext?.headers),
        ...((context.http?.resource ?? context.requestContext?.resource)
            ? { resource: context.http?.resource ?? context.requestContext?.resource }
            : {}),
        ...((context.http?.transportRequest ?? context.request)
            ? { transportRequest: context.http?.transportRequest ?? context.request }
            : {}),
    };
    return {
        ...context,
        http,
        headers: http.headers,
        signal,
        request: http.transportRequest,
        get requestContext(): GatewayRequestContext {
            return snapshotRequestContext({
                headers: Object.fromEntries(http.headers),
                ...(http.resource ? { resource: http.resource } : {}),
            });
        },
        get resourceRequest(): Request | undefined {
            return http.resource?.url
                ? new Request(http.resource.url, { method: http.resource.method, headers: http.headers, signal })
                : undefined;
        },
    };
}
