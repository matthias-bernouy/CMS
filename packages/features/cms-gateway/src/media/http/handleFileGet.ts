import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type { GatewayHttpCallOptions } from "cms-gateway/invocation/http/handleHttpCall";
import { privateMediaError } from "cms-gateway/media/http/privateMediaError";

/** Serves a provider file capability after the gateway rechecks the current route and actor grant. */
export async function handleGatewayFileGet(request: Request, options: GatewayHttpCallOptions): Promise<Response> {
    if (request.method !== "GET") {
        return privateMediaError(405, { allow: "GET" });
    }
    const url = new URL(request.url);
    if (!url.pathname.startsWith(`${options.prefix}/`) || url.search || url.hash) {
        return privateMediaError(404);
    }
    const segments = url.pathname.slice(options.prefix.length + 1).split("/");
    if (segments.length !== 3 || segments.some((segment) => !segment)) {
        return privateMediaError(404);
    }
    let contractId: string;
    let capabilityId: string;
    let fileId: string;
    try {
        [contractId, capabilityId, fileId] = segments.map(decodeURIComponent) as [string, string, string];
    } catch {
        return privateMediaError(400);
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
        return privateMediaError(400);
    }
    const rangeHeader = request.headers.get("range");
    if (rangeHeader !== null && !/^bytes=(?:\d+-\d*|-\d+)$/.test(rangeHeader)) {
        return privateMediaError(400);
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
            return new Response(null, {
                status: result.status,
                headers: {
                    "cache-control": "private, no-store",
                    "x-ulvia-request-id": result.requestId,
                    ...result.responseHeaders,
                },
            });
        }
        if (result.kind !== "binary") {
            return privateMediaError(502);
        }
        const canRange =
            rangeHeader &&
            (!request.headers.has("if-range") || request.headers.get("if-range") === result.responseHeaders?.etag);
        if (rangeHeader && result.status !== 200) {
            return privateMediaError(502);
        }
        const range = canRange ? byteRange(rangeHeader, result.bytes.byteLength) : undefined;
        if (canRange && !range) {
            return new Response(null, {
                status: 416,
                headers: {
                    "cache-control": "private, no-store",
                    "content-range": `bytes */${result.bytes.byteLength}`,
                },
            });
        }
        const bytes = range ? result.bytes.slice(range.start, range.end + 1) : result.bytes;
        return new Response(new Uint8Array(bytes), {
            status: range ? 206 : result.status,
            headers: {
                "content-type": result.contentType,
                "cache-control": "private, no-store",
                "x-ulvia-request-id": result.requestId,
                ...result.responseHeaders,
                "accept-ranges": "bytes",
                ...(range ? { "content-range": `bytes ${range.start}-${range.end}/${result.bytes.byteLength}` } : {}),
            },
        });
    } catch (error) {
        if (!(error instanceof GatewayError)) {
            return privateMediaError(500);
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
                      : error.code === "unsupported_behavior"
                        ? 501
                        : error.code === "invalid_provider_response" || error.code === "transport_failure"
                          ? 502
                          : 503;
        return privateMediaError(status, error.requestId ? { "x-ulvia-request-id": error.requestId } : {});
    }
}

function byteRange(value: string, length: number): { start: number; end: number } | null {
    const [first, last] = value.slice("bytes=".length).split("-") as [string, string];
    if (!first) {
        const suffix = Number(last);
        return Number.isSafeInteger(suffix) && suffix > 0 && length > 0
            ? { start: Math.max(0, length - suffix), end: length - 1 }
            : null;
    }
    const start = Number(first);
    const requestedEnd = last ? Number(last) : length - 1;
    if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(requestedEnd) ||
        start >= length ||
        requestedEnd < start
    ) {
        return null;
    }
    return { start, end: Math.min(requestedEnd, length - 1) };
}
