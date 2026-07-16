import type { SourceEndpoint } from "../../interfaces/Source";
import { responseHeaders } from "../endpointHeaders";
import { safeUpstreamFailureResponse } from "../upstreamFailure";
import { projectDataShape } from "./projectDataShape";
import { readBoundedJson } from "./readBoundedJson";

export const RESPONSE_PROJECTION_MODES = ["compatibility", "strict"] as const;
export type ResponseProjectionMode = typeof RESPONSE_PROJECTION_MODES[number];

export type ResponseProjectionEvent = {
    kind: "legacy_response_contract";
    endpointUrn: string;
    upstreamStatus: number;
    reason: "missing_output" | "empty_output" | "unmatched_status";
    correlationId: string;
};

export type ResponseProjectionReporter = (
    event: ResponseProjectionEvent,
) => void | Promise<void>;

export type ResponseProjectionOptions = {
    responseProjectionMode?: ResponseProjectionMode;
    reportResponseProjectionEvent?: ResponseProjectionReporter;
};

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
        return projectionFailure(request.method === "HEAD");
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
        return projectionFailure(request.method === "HEAD");
    }

    if (request.method === "HEAD") return discardBody(upstream);

    // File contracts stay streaming and media-type permissive during C14.
    if (endpoint.responseKind === "file") return passthrough(upstream);

    if (!declared.body) return discardBody(upstream);

    if (!isJsonMediaType(upstream.headers.get("content-type"))) {
        await cancelBody(upstream.body);
        return projectionFailure(false);
    }

    const parsed = await readBoundedJson(upstream.body, MAX_PROJECTED_JSON_BYTES);
    if (!parsed.ok) return projectionFailure(false);

    const projected = projectDataShape(parsed.value, declared.body);
    if (!projected.ok) return projectionFailure(false);

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

function projectionFailure(head: boolean): Response {
    return safeUpstreamFailureResponse(crypto.randomUUID(), { omitBody: head });
}

function reportLegacyContract(
    endpoint: SourceEndpoint,
    upstream: Response,
    reason: ResponseProjectionEvent["reason"],
    options: ResponseProjectionOptions,
): void {
    if (!options.reportResponseProjectionEvent) return;
    const event: ResponseProjectionEvent = {
        kind: "legacy_response_contract",
        endpointUrn: endpoint.urn,
        upstreamStatus: upstream.status,
        reason,
        correlationId: crypto.randomUUID(),
    };
    try {
        void Promise.resolve(options.reportResponseProjectionEvent(event)).catch(() => undefined);
    } catch {
        // Observability must not change source response behaviour.
    }
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
