import type { DataShape } from "../../interfaces/DataShape";
import { safeUpstreamFailureResponse } from "cms-sources/core/upstream/upstreamFailure";
import type { JsonValueType } from "./projectDataShape";

export type ResponseProjectionFailureReason =
    | "missing_output"
    | "empty_output"
    | "unmatched_status"
    | "unsupported_media_type"
    | "missing_body"
    | "body_too_large"
    | "invalid_utf8"
    | "invalid_json"
    | "body_read_error"
    | "type_mismatch";

export type ResponseProjectionEvent = {
    kind: "response_projection_failure";
    endpointUrn: string;
    upstreamStatus: number;
    reason: ResponseProjectionFailureReason;
    correlationId: string;
    path?: string;
    expectedType?: DataShape["type"];
    actualType?: JsonValueType;
};

export type ResponseProjectionReporter = (event: ResponseProjectionEvent) => void | Promise<void>;

export type ResponseProjectionOptions = {
    reportResponseProjectionEvent?: ResponseProjectionReporter;
    correlationId?: string;
    allowPublicCacheWithUpstreamCookie?: boolean;
};

export type ResponseProjectionFailureMetadata = {
    path?: string;
    expectedType?: DataShape["type"];
    actualType?: JsonValueType;
};

export function projectionFailure(
    endpointUrn: string,
    upstreamStatus: number,
    head: boolean,
    reason: ResponseProjectionFailureReason,
    options: ResponseProjectionOptions,
    metadata: ResponseProjectionFailureMetadata = {},
): Response {
    const correlationId = options.correlationId ?? crypto.randomUUID();
    reportResponseProjectionEvent(options, {
        kind: "response_projection_failure",
        endpointUrn,
        upstreamStatus,
        reason,
        correlationId,
        ...metadata,
    });
    return safeUpstreamFailureResponse(correlationId, { omitBody: head });
}

export function reportResponseProjectionEvent(
    options: ResponseProjectionOptions,
    event: ResponseProjectionEvent,
): void {
    if (!options.reportResponseProjectionEvent) {
        try {
            console.error(JSON.stringify({ scope: "cms-sources", ...event }));
        } catch {
            // The generic response remains authoritative if diagnostics fail.
        }
        return;
    }
    try {
        void Promise.resolve(options.reportResponseProjectionEvent(event)).catch(() => undefined);
    } catch {
        // Observability must not change source response behaviour.
    }
}
