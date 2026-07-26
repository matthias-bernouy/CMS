import type { RepositoryCompatibilityQuery } from "@bernouy/cms-control";
import type { RepositoryManagementTransportResponse } from "../transport";
import { rateLimitResult, simpleErrorResult, type SanitizedRepositoryManagementResult } from "./errors";
import {
    array,
    assertEqual,
    boolean,
    canonicalText,
    digest,
    enumValue,
    exactObject,
    nonNegativeInteger,
    packageKind,
    packageVersion,
    type JsonObject,
} from "./helpers";
import { validateCompatibilityPage } from "./reports";
import { validateOperationalMetrics, validateRecentOperations } from "./observability";

const HEALTH_VALUES = ["healthy", "degraded"] as const;
const DIAGNOSTIC_CODES = [
    "invalid-structure",
    "invalid-integration",
    "invalid-version",
    "invalid-package",
    "duplicate-kind",
    "duplicate-version-identity",
] as const;
const DIAGNOSTIC_STAGES = ["discovery", "index", "version", "package", "identity"] as const;
const RECOVERY_CODES = [
    "publication-replayed",
    "publication-quarantined",
    "stable-promotion-replayed",
    "stable-promotion-quarantined",
    "abandoned-staging-quarantined",
    "orphan-version-quarantined",
] as const;
const COMPATIBILITY_OUTCOMES = ["compatible", "breaking", "unknown", "invalid", "not-applicable"] as const;

export function validateStatusResponse(
    response: RepositoryManagementTransportResponse,
): SanitizedRepositoryManagementResult {
    if (response.status === 429) {
        return rateLimitResult(response);
    }
    assertEqual(response.status, 200);
    const body = exactObject(
        response.body,
        ["ready", "health", "integrations", "versions", "diagnostics", "quarantined", "recoveryDiagnostics"],
        ["metrics"],
    );
    assertEqual(boolean(body.ready), true);
    enumValue(body.health, HEALTH_VALUES);
    nonNegativeInteger(body.integrations);
    nonNegativeInteger(body.versions);
    nonNegativeInteger(body.diagnostics);
    nonNegativeInteger(body.quarantined);
    nonNegativeInteger(body.recoveryDiagnostics);
    if (body.metrics !== undefined) {
        validateOperationalMetrics(body.metrics);
    }
    return { status: 200, body };
}

export function validateDiagnosticsResponse(
    response: RepositoryManagementTransportResponse,
): SanitizedRepositoryManagementResult {
    if (response.status === 429) {
        return rateLimitResult(response);
    }
    assertEqual(response.status, 200);
    const body = exactObject(
        response.body,
        ["health", "diagnostics", "quarantined", "recovery"],
        ["metrics", "recentOperations"],
    );
    enumValue(body.health, HEALTH_VALUES);
    array(body.diagnostics).forEach(validateDiagnostic);
    array(body.quarantined).forEach(validateQuarantinedEntry);
    array(body.recovery).forEach(validateRecoveryDiagnostic);
    if (body.metrics !== undefined) {
        validateOperationalMetrics(body.metrics);
    }
    if (body.recentOperations !== undefined) {
        validateRecentOperations(body.recentOperations);
    }
    return { status: 200, body };
}

export function validateVersionsResponse(
    response: RepositoryManagementTransportResponse,
    expectedKind: string,
): SanitizedRepositoryManagementResult {
    if (response.status === 429) {
        return rateLimitResult(response);
    }
    if (response.status === 404) {
        return simpleErrorResult(response, 404, "integration_not_found", "Integration was not found");
    }
    assertEqual(response.status, 200);
    const body = exactObject(response.body, ["kind", "versions"], ["stable", "latest"]);
    assertEqual(packageKind(body.kind), expectedKind);
    const versions = array(body.versions).map(validateVersionSummary);
    const versionNames = versions.map((entry) => entry.version as string);
    if (new Set(versionNames).size !== versionNames.length) {
        throw new TypeError("Repository versions are not unique");
    }
    for (const channel of [body.stable, body.latest]) {
        if (channel !== undefined && !versionNames.includes(packageVersion(channel))) {
            throw new TypeError("Repository channel is not present in versions");
        }
    }
    return { status: 200, body };
}

export function validateCompatibilityResponse(
    response: RepositoryManagementTransportResponse,
    query: RepositoryCompatibilityQuery,
): SanitizedRepositoryManagementResult {
    if (response.status === 429) {
        return rateLimitResult(response);
    }
    if (response.status === 404) {
        return simpleErrorResult(
            response,
            404,
            "compatibility_history_not_found",
            "Compatibility history was not found",
        );
    }
    assertEqual(response.status, 200);
    const body = validateCompatibilityPage(response.body, {
        kind: query.kind,
        version: query.version,
        ...(query.after ? { after: query.after } : {}),
    });
    return { status: 200, body };
}

function validateDiagnostic(value: unknown): void {
    const diagnostic = exactObject(value, ["code", "stage", "message"], ["kind", "version"]);
    enumValue(diagnostic.code, DIAGNOSTIC_CODES);
    enumValue(diagnostic.stage, DIAGNOSTIC_STAGES);
    canonicalText(diagnostic.message, 16_384);
    if (diagnostic.kind !== undefined) {
        packageKind(diagnostic.kind);
    }
    if (diagnostic.version !== undefined) {
        packageVersion(diagnostic.version);
    }
}

function validateQuarantinedEntry(value: unknown): void {
    const entry = exactObject(value, ["diagnosticCodes"], ["kind"]);
    const codes = array(entry.diagnosticCodes).map((code) => enumValue(code, DIAGNOSTIC_CODES));
    if (codes.length === 0 || new Set(codes).size !== codes.length) {
        throw new TypeError("Repository quarantine diagnostic codes are invalid");
    }
    if (entry.kind !== undefined) {
        packageKind(entry.kind);
    }
}

function validateRecoveryDiagnostic(value: unknown): void {
    const diagnostic = exactObject(value, ["code", "message"], ["operationId", "kind", "version"]);
    enumValue(diagnostic.code, RECOVERY_CODES);
    canonicalText(diagnostic.message, 16_384);
    if (diagnostic.operationId !== undefined) {
        canonicalText(diagnostic.operationId, 512);
    }
    if (diagnostic.kind !== undefined) {
        packageKind(diagnostic.kind);
    }
    if (diagnostic.version !== undefined) {
        packageVersion(diagnostic.version);
    }
}

function validateVersionSummary(value: unknown): JsonObject {
    const summary = exactObject(value, ["version", "compatibility"], ["digest"]);
    packageVersion(summary.version);
    if (summary.digest !== undefined) {
        digest(summary.digest);
    }
    if (summary.compatibility !== null) {
        const compatibility = exactObject(summary.compatibility, [
            "admissionReportId",
            "currentReportRevisionId",
            "outcome",
            "admissible",
            "warning",
        ]);
        canonicalText(compatibility.admissionReportId, 512);
        canonicalText(compatibility.currentReportRevisionId, 512);
        enumValue(compatibility.outcome, COMPATIBILITY_OUTCOMES);
        boolean(compatibility.admissible);
        boolean(compatibility.warning);
    }
    return summary;
}
