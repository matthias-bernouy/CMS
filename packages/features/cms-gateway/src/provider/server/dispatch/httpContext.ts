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
        headers: new Headers(context.http?.headers ?? context.requestContext?.headers),
        ...((context.http?.resource ?? context.requestContext?.resource)
            ? { resource: context.http?.resource ?? context.requestContext?.resource }
            : {}),
        ...(context.http?.transportRequest ? { transportRequest: context.http?.transportRequest } : {}),
    };
    return {
        ...context,
        http,
        signal,
        get requestContext(): GatewayRequestContext {
            return snapshotRequestContext({
                headers: Object.fromEntries(http.headers),
                ...(http.resource ? { resource: http.resource } : {}),
            });
        },
    };
}
