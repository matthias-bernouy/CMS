import type { SourceEndpoint } from "../../interfaces/Source";
import { DataShapeProjectionError } from "../model/projectStrictDataShape";
import { projectDataShape } from "./projectDataShape";
import { readBoundedJson } from "./readBoundedJson";
import {
    projectionFailure,
    reportResponseProjectionEvent,
    type LegacyResponseContractReason,
    type ResponseProjectionOptions,
} from "./responseProjectionEvents";
import { attachProjectedTriggerResponseBody } from "./triggerResponseBody";
import {
    cancelResponseBody,
    discardResponseBody,
    isJsonMediaType,
    passthroughResponse,
    projectedJsonResponse,
} from "./projectedResponse";

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
            if (request.method === "HEAD") {
                return discardResponseBody(upstream);
            }
            return passthroughResponse(upstream);
        }

        await cancelResponseBody(upstream.body);
        return projectionFailure(
            endpoint.urn,
            upstream.status,
            request.method === "HEAD",
            output === undefined ? "missing_output" : "empty_output",
            options,
        );
    }

    const declared =
        output.find((candidate) => candidate.status === String(upstream.status)) ??
        output.find((candidate) => candidate.status === "default");
    if (!declared) {
        if ((options.responseProjectionMode ?? "compatibility") === "compatibility") {
            reportLegacyContract(endpoint, upstream, "unmatched_status", options);
            if (request.method === "HEAD") {
                return discardResponseBody(upstream);
            }
            return passthroughResponse(upstream);
        }
        await cancelResponseBody(upstream.body);
        return projectionFailure(endpoint.urn, upstream.status, request.method === "HEAD", "unmatched_status", options);
    }

    if (request.method === "HEAD") {
        return discardResponseBody(upstream);
    }

    // File contracts stay streaming and media-type permissive during C14.
    if (endpoint.responseKind === "file") {
        return passthroughResponse(upstream);
    }

    if (!declared.body) {
        return discardResponseBody(upstream);
    }

    if (!isJsonMediaType(upstream.headers.get("content-type"))) {
        await cancelResponseBody(upstream.body);
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

    const response = projectedJsonResponse(upstream, projected.value);
    if (declared.triggerBody) {
        try {
            attachProjectedTriggerResponseBody(response, parsed.value, projected.value, declared.triggerBody);
        } catch (error) {
            if (!(error instanceof DataShapeProjectionError)) {
                throw error;
            }
            return projectionFailure(endpoint.urn, upstream.status, false, "type_mismatch", options, {
                path: "$trigger",
                expectedType: declared.triggerBody.type,
            });
        }
    }
    return response;
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
