import type { RepositoryReevaluationInput } from "@bernouy/cms-control";
import type { RepositoryManagementTransportResponse } from "../../transport";
import { rateLimitResult, simpleErrorResult, type SanitizedRepositoryManagementResult } from "../errors";
import { array, assertEqual, boolean, canonicalText, digest, exactObject } from "../helpers";
import { validateCompatibilityReport } from "../reports";

export type ReevaluationIdentity = Readonly<{
    input: RepositoryReevaluationInput;
    actor: string;
    evidenceIds?: readonly string[];
}>;

export async function validateReevaluationResponse(
    response: RepositoryManagementTransportResponse,
    expected: ReevaluationIdentity,
): Promise<SanitizedRepositoryManagementResult> {
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
            "integration_compatibility_reevaluation_not_found",
            "Integration compatibility history was not found",
        );
    }
    if (response.status === 409) {
        return validateConflict(response);
    }
    if (response.status === 422) {
        return simpleErrorResult(
            response,
            422,
            "integration_compatibility_reevaluation_invalid",
            "Compatibility reevaluation request is invalid",
        );
    }
    assertEqual(response.status, 201);
    const body = exactObject(response.body, ["revision", "currentReport"], ["release"]);
    const revision = await validateCompatibilityReport(
        body.revision,
        {
            kind: expected.input.kind,
            version: expected.input.version,
        },
        "revision",
    );
    assertEqual(revision.report.supersedes, expected.input.currentReport.revisionId);
    const currentReport = exactObject(body.currentReport, ["revisionId", "reportDigest"]);
    assertEqual(currentReport.revisionId, revision.report.reportId);
    assertEqual(currentReport.reportDigest, revision.reportDigest);
    validateExpectedProvenance(revision.report.provenance, expected);
    if (body.release !== undefined) {
        validateRelease(body.release, revision.report.reportId);
    }
    return {
        status: 201,
        body: {
            revision: revision.projected,
            currentReport: {
                revisionId: revision.report.reportId,
                reportDigest: revision.reportDigest,
            },
            ...(body.release ? { release: body.release } : {}),
        },
    };
}

function validateRelease(value: unknown, expectedReportId: string): void {
    const release = exactObject(value, [
        "compatibilityReportRevisionId",
        "decision",
        "admissible",
        "eligibilityChanged",
    ]);
    assertEqual(canonicalText(release.compatibilityReportRevisionId, 512), expectedReportId);
    const decision = exactObject(release.decision, ["revisionId", "digest"]);
    canonicalText(decision.revisionId, 512);
    digest(decision.digest);
    boolean(release.admissible);
    boolean(release.eligibilityChanged);
}

function validateConflict(response: RepositoryManagementTransportResponse): SanitizedRepositoryManagementResult {
    const initial = exactObject(response.body, ["code", "error"], ["currentDecision", "currentReportRevisionId"]);
    canonicalText(initial.error, 2_048);
    if (initial.code === "integration_compatibility_reevaluation_stale_report") {
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
    if (initial.code === "integration_compatibility_reevaluation_stale_decision") {
        const body = exactObject(response.body, ["code", "error", "currentDecision"]);
        const currentDecision = exactObject(body.currentDecision, ["revisionId", "digest"]);
        return {
            status: 409,
            body: {
                code: initial.code,
                error: "Release admission decision is stale",
                currentDecision: {
                    revisionId: canonicalText(currentDecision.revisionId, 512),
                    digest: digest(currentDecision.digest),
                },
            },
        };
    }
    if (
        initial.code !== "integration_compatibility_reevaluation_conflict" &&
        initial.code !== "integration_compatibility_reevaluation_integrity_conflict"
    ) {
        throw new TypeError("Unexpected compatibility reevaluation conflict");
    }
    return {
        status: 409,
        body: {
            code: initial.code,
            error: "Compatibility reevaluation conflicts with immutable report history",
        },
    };
}

function validateExpectedProvenance(value: unknown, expected: ReevaluationIdentity): void {
    const provenance = exactObject(value, ["actor", "reason"], ["evidenceIds"]);
    assertEqual(canonicalText(provenance.actor, 512), expected.actor);
    assertEqual(canonicalText(provenance.reason, 4_096), expected.input.reason);
    const actualEvidence =
        provenance.evidenceIds === undefined
            ? undefined
            : array(provenance.evidenceIds, 128).map((entry) => canonicalText(entry, 512));
    if (JSON.stringify(actualEvidence) !== JSON.stringify(expected.evidenceIds)) {
        throw new TypeError("Compatibility reevaluation provenance is invalid");
    }
}
