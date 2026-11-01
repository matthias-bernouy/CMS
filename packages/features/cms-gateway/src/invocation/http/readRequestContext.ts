import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import { decodeRequestContext, REQUEST_CONTEXT_HEADER, requestContext } from "cms-gateway/protocol/http/requestContext";

/** Classify malformed caller metadata at the HTTP boundary, before invoking a capability. */
export function readGatewayRequestContext(
    request: Request,
    resource = false,
    custom: readonly string[] = [],
    trusted = false,
) {
    try {
        return (
            (trusted ? decodeRequestContext(request.headers.get(REQUEST_CONTEXT_HEADER)) : undefined) ??
            requestContext(request, resource, custom)
        );
    } catch {
        throw new GatewayError("invalid_input", "Invalid HTTP request context");
    }
}
