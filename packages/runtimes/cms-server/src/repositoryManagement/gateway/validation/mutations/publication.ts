import type { RepositoryManagementTransportResponse } from "../../transport";
import { rateLimitResult, simpleErrorResult, type SanitizedRepositoryManagementResult } from "../errors";
import { assertEqual, canonicalText, digest, exactObject, packageKind, packageVersion } from "../helpers";
import { validateAdmissionReport } from "../reports";

export type PublicationIdentity = Readonly<{ kind: string; version: string; digest: string }>;

export function validatePublicationResponse(
    response: RepositoryManagementTransportResponse,
    expected: PublicationIdentity,
): SanitizedRepositoryManagementResult {
    if (response.status === 429) {
        return rateLimitResult(response);
    }
    if (response.status === 413) {
        return simpleErrorResult(
            response,
            413,
            "management_package_upload_too_large",
            "Integration package upload is too large",
        );
    }
    if (response.status === 409) {
        return validatePublicationConflict(response, expected);
    }
    if (response.status === 422) {
        const body = exactObject(response.body, ["code", "error", "report"]);
        assertEqual(body.code, "integration_compatibility_rejected");
        canonicalText(body.error, 2_048);
        const report = validateAdmissionReport(body.report, expected);
        return {
            status: 422,
            body: {
                code: "integration_compatibility_rejected",
                error: "Integration compatibility admission was rejected",
                report,
            },
        };
    }
    assertEqual(response.status, 201);
    const body = exactObject(response.body, ["operationId", "kind", "version", "digest", "report"]);
    canonicalText(body.operationId, 512);
    assertEqual(packageKind(body.kind), expected.kind);
    assertEqual(packageVersion(body.version), expected.version);
    assertEqual(digest(body.digest), expected.digest);
    validateAdmissionReport(body.report, expected);
    return { status: 201, body };
}

function validatePublicationConflict(
    response: RepositoryManagementTransportResponse,
    expected: PublicationIdentity,
): SanitizedRepositoryManagementResult {
    const initial = exactObject(response.body, ["code", "error", "kind", "version"], ["existingDigest", "latest"]);
    canonicalText(initial.error, 2_048);
    assertEqual(packageKind(initial.kind), expected.kind);
    assertEqual(packageVersion(initial.version), expected.version);
    if (initial.code === "integration_version_exists") {
        const body = exactObject(response.body, ["code", "error", "kind", "version"], ["existingDigest"]);
        const existingDigest = body.existingDigest === undefined ? undefined : digest(body.existingDigest);
        return {
            status: 409,
            body: {
                code: "integration_version_exists",
                error: "Integration version already exists",
                kind: expected.kind,
                version: expected.version,
                ...(existingDigest ? { existingDigest } : {}),
            },
        };
    }
    assertEqual(initial.code, "integration_version_not_newer");
    const body = exactObject(response.body, ["code", "error", "kind", "version", "latest"]);
    return {
        status: 409,
        body: {
            code: "integration_version_not_newer",
            error: "Integration version must be newer than latest",
            kind: expected.kind,
            version: expected.version,
            latest: packageVersion(body.latest),
        },
    };
}
