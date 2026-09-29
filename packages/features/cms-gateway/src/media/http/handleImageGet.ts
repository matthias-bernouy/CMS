import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type { GatewayActor, GatewayOrigin } from "cms-gateway/invocation/interfaces/Invocation";
import type { ProviderImageService } from "cms-gateway/media/core/providerImageService";

export interface GatewayImageHttpOptions {
    readonly images: Pick<ProviderImageService, "get">;
    readonly siteId: string;
    readonly origin: GatewayOrigin;
    readonly actor: GatewayActor;
    readonly prefix: string;
}

/** The original file is authorized before every derivative lookup. */
export async function handleGatewayImageGet(request: Request, options: GatewayImageHttpOptions): Promise<Response> {
    if (request.method !== "GET") {
        return new Response(null, { status: 405, headers: { allow: "GET" } });
    }
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${options.prefix}/`) || url.search || url.hash) {
        return new Response(null, { status: 404 });
    }
    const segments = url.pathname.slice(options.prefix.length + 1).split("/");
    if (segments.length !== 4 || segments.some((segment) => !segment)) {
        return new Response(null, { status: 404 });
    }
    const widthMatch = /^(\d+)\.webp$/.exec(segments[3]!);
    if (!widthMatch) {
        return new Response(null, { status: 404 });
    }
    let contractId: string;
    let capabilityId: string;
    let fileId: string;
    try {
        [contractId, capabilityId, fileId] = segments.slice(0, 3).map(decodeURIComponent) as [string, string, string];
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
        const derivative = await options.images.get(
            {
                siteId: options.siteId,
                contractId,
                capabilityId,
                input: { fileId },
                origin: options.origin,
                actor: options.actor,
            },
            Number(widthMatch[1]),
        );
        if ("status" in derivative) {
            return new Response(null, {
                status: derivative.status,
                headers: {
                    "cache-control": "private, no-store",
                    "x-ulvia-request-id": derivative.requestId,
                    ...derivative.responseHeaders,
                },
            });
        }
        return new Response(new Uint8Array(derivative.bytes), {
            headers: {
                "content-type": "image/webp",
                "cache-control": "private, no-store",
                etag: derivative.etag,
            },
        });
    } catch (error) {
        if (!(error instanceof GatewayError)) {
            return new Response(null, { status: 500 });
        }
        const status =
            error.code === "invalid_input"
                ? 400
                : error.code === "outcome_unknown"
                  ? 409
                  : error.code === "not_selected"
                    ? 404
                    : error.code === "not_authorized"
                      ? options.actor.kind === "anonymous"
                          ? 401
                          : 403
                      : error.code === "invalid_provider_response" || error.code === "transport_failure"
                        ? 502
                        : 503;
        return new Response(null, {
            status,
            headers: error.requestId ? { "x-ulvia-request-id": error.requestId } : undefined,
        });
    }
}
