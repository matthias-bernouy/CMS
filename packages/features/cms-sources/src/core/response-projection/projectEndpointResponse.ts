import type { SourceEndpoint } from "../../interfaces/Source";
import { responseHeaders } from "../endpointHeaders";
import { projectDataShape } from "./projectDataShape";
import { readBoundedJson } from "./readBoundedJson";
import {
    projectionFailure,
    reportResponseProjectionEvent,
    type LegacyResponseContractReason,
    type ResponseProjectionOptions,
} from "./responseProjectionEvents";

export {
    RESPONSE_PROJECTION_MODES,
    type LegacyResponseContractReason,
    type ResponseProjectionEvent,
    type ResponseProjectionFailureReason,
    type ResponseProjectionMode,
    type ResponseProjectionOptions,
    type ResponseProjectionReporter,
} from "./responseProjectionEvents";

export const MAX_PROJECTED_JSON_BYTES = 2 * 1024 * 1024;

/** Applies the endpoint's declared response contract to one upstream response. */
export async function projectEndpointResponse(
    endpoint: SourceEndpoint,
    request: Request,
    upstream: Response,
    options: ResponseProjectionOptions = {},
): Promise<Response> {
    const output = endpoint.output;
    if (!output?.length) {
        if ((options.responseProjectionMode ?? "compatibility") === "compatibility") {
            reportLegacyContract(endpoint, upstream, output === undefined ? "missing_output" : "empty_output", options);
            if (request.method === "HEAD") return discardBody(upstream);
            return passthrough(upstream);
        }

        await cancelBody(upstream.body);
        return projectionFailure(
            endpoint.urn,
            upstream.status,
            request.method === "HEAD",
            output === undefined ? "missing_output" : "empty_output",
            options,
        );
    }

    const declared = output.find(candidate => candidate.status === String(upstream.status))
        ?? output.find(candidate => candidate.status === "default");
    if (!declared) {
        if ((options.responseProjectionMode ?? "compatibility") === "compatibility") {
            reportLegacyContract(endpoint, upstream, "unmatched_status", options);
            if (request.method === "HEAD") return discardBody(upstream);
            return passthrough(upstream);
        }
        await cancelBody(upstream.body);
        return projectionFailure(
            endpoint.urn,
            upstream.status,
            request.method === "HEAD",
            "unmatched_status",
            options,
        );
    }

    if (request.method === "HEAD") return discardBody(upstream);

    // File contracts stay streaming and media-type permissive during C14.
    if (endpoint.responseKind === "file") return passthrough(upstream);

    if (!declared.body) return discardBody(upstream);

    if (!isJsonMediaType(upstream.headers.get("content-type"))) {
        await cancelBody(upstream.body);
        return projectionFailure(endpoint.urn, upstream.status, false, "unsupported_media_type", options, {
            path: "$",
            expectedType: declared.body.type,
        });
    }

    const parsed = await readBoundedJson(upstream.body, MAX_PROJECTED_JSON_BYTES);
    if (!parsed.ok) {
        return projectionFailure(endpoint.urn, upstream.status, false, parsed.reason, options, {
            path: "$",
            expectedType: declared.body.type,
        });
    }

    const projected = projectDataShape(parsed.value, declared.body);
    if (!projected.ok) {
        return projectionFailure(endpoint.urn, upstream.status, false, projected.reason, options, {
            path: projected.path,
            expectedType: projected.expectedType,
            actualType: projected.actualType,
        });
    }

    return projectedJsonResponse(upstream, projected.value);
}

function passthrough(upstream: Response): Response {
    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders(upstream),
    });
}

async function discardBody(upstream: Response): Promise<Response> {
    await cancelBody(upstream.body);
    const headers = responseHeaders(upstream);
    headers.delete("content-type");
    headers.delete("etag");
    headers.delete("last-modified");
    return new Response(null, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}

function projectedJsonResponse(upstream: Response, value: unknown): Response {
    const headers = responseHeaders(upstream);
    headers.delete("etag");
    headers.delete("last-modified");
    headers.delete("content-length");
    headers.delete("content-encoding");
    headers.set("content-type", "application/json; charset=utf-8");
    headers.set("x-content-type-options", "nosniff");
    return new Response(JSON.stringify(value), {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}

function reportLegacyContract(
    endpoint: SourceEndpoint,
    upstream: Response,
    reason: LegacyResponseContractReason,
    options: ResponseProjectionOptions,
): void {
    reportResponseProjectionEvent(options, {
        kind: "legacy_response_contract",
        endpointUrn: endpoint.urn,
        upstreamStatus: upstream.status,
        reason,
        correlationId: crypto.randomUUID(),
    });
}

function isJsonMediaType(contentType: string | null): boolean {
    if (!contentType) return false;
    const mediaType = contentType.split(";", 1)[0]!.trim().toLowerCase();
    return mediaType === "application/json"
        || (/^[^\s/;]+\/[^\s/;]+\+json$/).test(mediaType);
}

async function cancelBody(body: ReadableStream<Uint8Array> | null): Promise<void> {
    if (!body) return;
    await body.cancel().catch(() => undefined);
}
