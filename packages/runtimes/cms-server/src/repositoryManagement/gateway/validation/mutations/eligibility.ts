import type { RepositoryVersionBlockInput } from "@bernouy/cms-control";
import type { RepositoryManagementTransportResponse } from "../../transport";
import { rateLimitResult, simpleErrorResult, type SanitizedRepositoryManagementResult } from "../errors";
import {
    assertEqual,
    canonicalText,
    digest,
    exactObject,
    isoTimestamp,
    packageKind,
    packageVersion,
    type JsonObject,
} from "../helpers";

export type VersionBlockIdentity = Readonly<{ input: RepositoryVersionBlockInput; actor: string }>;

export function validateVersionBlockResponse(
    response: RepositoryManagementTransportResponse,
    expected: VersionBlockIdentity,
): SanitizedRepositoryManagementResult {
    if (response.status === 429) {
        return rateLimitResult(response);
    }
    if (response.status === 413) {
        return simpleErrorResult(response, 413, "management_request_too_large", "Repository request is too large");
    }
    if (response.status === 404) {
        return simpleErrorResult(
            response,
            404,
            "integration_registry_version_eligibility_not_found",
            "Integration version was not found",
        );
    }
    if (response.status === 409 || response.status === 422) {
        return validateError(response);
    }
    assertEqual(response.status, 201);
    const body = exactObject(response.body, ["operationId", "record"]);
    const operationId = canonicalText(body.operationId, 512);
    const record = validateRecord(body.record, expected);
    assertEqual(record.operationId, operationId);
    return { status: 201, body };
}

function validateRecord(value: unknown, expected: VersionBlockIdentity): JsonObject {
    const record = exactObject(
        value,
        [
            "action",
            "confirmation",
            "createdAt",
            "decision",
            "id",
            "kind",
            "nextChannels",
            "nextStatus",
            "operationId",
            "packageDigest",
            "previousChannels",
            "provenance",
            "schema",
            "version",
        ],
        ["previousStatus"],
    );
    assertEqual(record.schema, "cms.integration.registry.version-eligibility.v1");
    assertEqual(record.action, "block");
    canonicalText(record.id, 512);
    canonicalText(record.operationId, 512);
    assertEqual(packageKind(record.kind), expected.input.kind);
    assertEqual(packageVersion(record.version), expected.input.version);
    digest(record.packageDigest);
    assertEqual(record.nextStatus, "blocked");
    if (record.previousStatus !== undefined) {
        const previous = canonicalText(record.previousStatus, 64);
        if (!["blocked", "inadmissible", "unverified"].includes(previous)) {
            throw new TypeError("Unexpected previous eligibility status");
        }
    }
    validateDecision(record.decision, expected.input.currentDecision);
    validateChannels(record.previousChannels);
    validateChannels(record.nextChannels);
    const provenance = exactObject(record.provenance, ["actor", "reason"]);
    assertEqual(canonicalText(provenance.actor, 512), expected.actor);
    assertEqual(canonicalText(provenance.reason, 4_096), expected.input.reason);
    validateConfirmation(record.confirmation, expected.input.confirmation);
    isoTimestamp(record.createdAt);
    return record;
}

function validateError(response: RepositoryManagementTransportResponse): SanitizedRepositoryManagementResult {
    const body = exactObject(response.body, ["code", "error"]);
    const code = canonicalText(body.code, 512);
    canonicalText(body.error, 2_048);
    const allowed = new Set([
        "integration_registry_version_eligibility_stale_decision",
        "integration_registry_version_eligibility_conflict",
        "integration_registry_version_eligibility_ineligible",
        "integration_registry_version_eligibility_confirmation_required",
        "integration_registry_version_eligibility_invalid",
    ]);
    if (!allowed.has(code)) {
        throw new TypeError("Unexpected version eligibility error");
    }
    return { status: response.status, body: { code, error: "Version block failed" } };
}

function validateDecision(value: unknown, expected: RepositoryVersionBlockInput["currentDecision"]): void {
    const decision = exactObject(value, ["digest", "revisionId"]);
    assertEqual(canonicalText(decision.revisionId, 512), expected.revisionId);
    assertEqual(digest(decision.digest), expected.digest);
}

function validateConfirmation(value: unknown, expected: RepositoryVersionBlockInput["confirmation"]): void {
    const confirmation = exactObject(value, ["action", "decisionDigest", "decisionRevisionId", "kind", "version"]);
    assertEqual(confirmation.action, "block");
    assertEqual(packageKind(confirmation.kind), expected.kind);
    assertEqual(packageVersion(confirmation.version), expected.version);
    assertEqual(canonicalText(confirmation.decisionRevisionId, 512), expected.decisionRevisionId);
    assertEqual(digest(confirmation.decisionDigest), expected.decisionDigest);
}

function validateChannels(value: unknown): void {
    const channels = exactObject(value, [], ["latest", "stable"]);
    if (channels.stable !== undefined) {
        packageVersion(channels.stable);
    }
    if (channels.latest !== undefined) {
        packageVersion(channels.latest);
    }
}
