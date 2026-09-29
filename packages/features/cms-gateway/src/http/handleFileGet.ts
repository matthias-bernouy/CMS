import { GatewayError } from "../core/GatewayError";
import type { GatewayHttpCallOptions } from "./handleHttpCall";

/** Serves a provider file capability after the gateway rechecks the current route and actor grant. */
export async function handleGatewayFileGet(request: Request, options: GatewayHttpCallOptions): Promise<Response> {
    if (request.method !== "GET") {
        return new Response(null, { status: 405, headers: { allow: "GET" } });
    }
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${options.prefix}/`) || url.search || url.hash) {
        return new Response(null, { status: 404 });
    }
    const segments = url.pathname.slice(options.prefix.length + 1).split("/");
    if (segments.length !== 3 || segments.some((segment) => !segment)) {
        return new Response(null, { status: 404 });
    }
    let contractId: string;
    let capabilityId: string;
    let fileId: string;
    try {
        [contractId, capabilityId, fileId] = segments.map(decodeURIComponent) as [string, string, string];
    } catch {
        return new Response(null, { status: 400 });
    }
    const identifier = /^[a-z][a-z0-9]*(?:[.-][a-z][a-z0-9]*)*$/;
    if (
        !identifier.test(contractId) ||
        !identifier.test(capabilityId) ||
        contractId.length > 128 ||
        capabilityId.length > 128 ||
        fileId.length > 256 ||
        !fileId.trim()
    ) {
        return new Response(null, { status: 400 });
    }
    try {
        const result = await options.invoker.invoke({
            siteId: options.siteId,
            contractId,
            capabilityId,
            input: { fileId },
            origin: options.origin,
            actor: options.actor,
        });
        if (result.kind === "declared-error") {
            return new Response(null, { status: result.status, headers: { "cache-control": "private, no-store" } });
        }
        if (result.kind !== "binary") {
            return new Response(null, { status: 502 });
        }
        return new Response(new Uint8Array(result.bytes), {
            status: result.status,
            headers: {
                "content-type": result.contentType,
                "cache-control": "private, no-store",
                "x-ulvia-request-id": result.requestId,
            },
        });
    } catch (error) {
        if (!(error instanceof GatewayError)) {
            return new Response(null, { status: 500 });
        }
        const status =
            error.code === "invalid_input"
                ? 400
                : error.code === "not_selected"
                  ? 404
                  : error.code === "not_authorized"
                    ? options.actor.kind === "anonymous"
                        ? 401
                        : 403
                    : error.code === "unsupported_behavior"
                      ? 501
                      : error.code === "invalid_provider_response" || error.code === "transport_failure"
                        ? 502
                        : 503;
        return new Response(null, { status });
    }
}
