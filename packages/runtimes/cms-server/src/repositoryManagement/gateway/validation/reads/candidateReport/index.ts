import type { RepositoryManagementTransportResponse } from "../../../transport";
import { validateCandidateErrorResponse, validateCandidateProjection } from "../../mutations/candidates";
import { rateLimitResult, type SanitizedRepositoryManagementResult } from "../../errors";
import { assertEqual, exactObject } from "../../helpers";
import { validateCandidateCompatibility } from "./compatibility";
import { validateCandidateMigrations } from "./migrations";
import { candidateReportIdentity } from "./shared";
import { validateCandidateVerification } from "./verification";

const REPORT_SCHEMA = "cms.repository.management.candidate-report.v1";

export function validateCandidateReportResponse(
    response: RepositoryManagementTransportResponse,
    candidateId: string,
): SanitizedRepositoryManagementResult {
    if (response.status === 429) {
        return rateLimitResult(response);
    }
    if (response.status !== 200) {
        return validateCandidateErrorResponse(response);
    }
    const body = exactObject(response.body, ["report"]);
    const report = exactObject(body.report, ["schema", "candidate", "migrations"], ["compatibility", "verification"]);
    assertEqual(report.schema, REPORT_SCHEMA);
    const candidate = validateCandidateProjection(report.candidate);
    const identity = candidateReportIdentity(candidate);
    assertEqual(identity.candidateId, candidateId);
    if (report.compatibility !== undefined) {
        validateCandidateCompatibility(report.compatibility, identity);
    }
    if (report.verification !== undefined) {
        validateCandidateVerification(report.verification, identity);
    }
    validateCandidateMigrations(report.migrations, identity);
    return { status: 200, body };
}
