import type { RepositoryStablePromotionInput } from "@bernouy/cms-control";
import type { RepositoryManagementTransportResponse } from "../transport";
import { rateLimitResult, simpleErrorResult, type SanitizedRepositoryManagementResult } from "./errors";
import {
    assertEqual,
    canonicalText,
    digest,
    exactObject,
    isoTimestamp,
    packageKind,
    packageVersion,
    type JsonObject,
} from "./helpers";

export type PromotionIdentity = Readonly<{ input: RepositoryStablePromotionInput; actor: string }>;

export function validatePromotionResponse(
    response: RepositoryManagementTransportResponse,
    expected: PromotionIdentity,
): SanitizedRepositoryManagementResult {
    if (response.status === 429) {
        return rateLimitResult(response);
    }
    if (response.status === 413) {
        return simpleErrorResult(
            response,
            413,
            "management_request_too_large",
            "Repository management request is too large",
        );
    }
    if (response.status === 404) {
        return simpleErrorResult(
            response,
            404,
            "integration_registry_stable_promotion_not_found",
            "Integration version was not found",
        );
    }
    if (response.status === 409 || response.status === 422) {
        return validatePromotionError(response, expected);
    }
    assertEqual(response.status, 201);
    const body = exactObject(response.body, ["operationId", "record"]);
    const operationId = canonicalText(body.operationId, 512);
    const record = validatePromotionRecord(body.record, expected);
    assertEqual(record.operationId, operationId);
    return { status: 201, body };
}

function validatePromotionError(
    response: RepositoryManagementTransportResponse,
    expected: PromotionIdentity,
): SanitizedRepositoryManagementResult {
    const initial = exactObject(response.body, ["code", "error"], ["currentReportRevisionId", "reportRevisionId"]);
    canonicalText(initial.error, 2_048);
    if (response.status === 409 && initial.code === "integration_registry_stable_promotion_stale_report") {
        const body = exactObject(response.body, ["code", "error", "currentReportRevisionId"]);
        return {
            status: 409,
            body: {
                code: initial.code,
                error: "Compatibility report revision is stale",
                currentReportRevisionId: canonicalText(body.currentReportRevisionId, 512),
            },
        };
    }
    if (response.status === 409 && initial.code === "integration_registry_stable_promotion_conflict") {
        exactObject(response.body, ["code", "error"]);
        return { status: 409, body: { code: initial.code, error: "Integration version is already stable" } };
    }
    if (response.status === 422 && initial.code === "integration_registry_stable_promotion_ineligible") {
        const body = exactObject(response.body, ["code", "error", "reportRevisionId"]);
        const reportRevisionId = canonicalText(body.reportRevisionId, 512);
        assertEqual(reportRevisionId, expected.input.currentReportRevisionId);
        return {
            status: 422,
            body: {
                code: initial.code,
                error: "Integration version is not eligible for stable promotion",
                reportRevisionId,
            },
        };
    }
    if (
        response.status === 422 &&
        (initial.code === "integration_registry_stable_promotion_confirmation_required" ||
            initial.code === "integration_registry_stable_promotion_invalid")
    ) {
        exactObject(response.body, ["code", "error"]);
        return { status: 422, body: { code: initial.code, error: "Stable promotion request is invalid" } };
    }
    throw new TypeError("Unexpected stable promotion error");
}

function validatePromotionRecord(value: unknown, expected: PromotionIdentity): JsonObject {
    const record = exactObject(
        value,
        [
            "schema",
            "id",
            "operationId",
            "kind",
            "version",
            "packageDigest",
            "reportRevisionId",
            "actor",
            "confirmation",
            "createdAt",
        ],
        ["previousStable", "reason"],
    );
    assertEqual(record.schema, "cms.integration.registry.stable-promotion.v1");
    canonicalText(record.id, 512);
    canonicalText(record.operationId, 512);
    assertEqual(packageKind(record.kind), expected.input.kind);
    assertEqual(packageVersion(record.version), expected.input.version);
    digest(record.packageDigest);
    assertEqual(canonicalText(record.reportRevisionId, 512), expected.input.currentReportRevisionId);
    assertEqual(canonicalText(record.actor, 512), expected.actor);
    const confirmation = exactObject(record.confirmation, ["version", "reportRevisionId"]);
    assertEqual(packageVersion(confirmation.version), expected.input.confirmation.version);
    assertEqual(canonicalText(confirmation.reportRevisionId, 512), expected.input.confirmation.reportRevisionId);
    isoTimestamp(record.createdAt);
    if (record.previousStable !== undefined) {
        packageVersion(record.previousStable);
    }
    if (expected.input.reason === undefined) {
        assertEqual(record.reason, undefined);
    } else {
        assertEqual(canonicalText(record.reason, 4_096), expected.input.reason);
    }
    return record;
}
