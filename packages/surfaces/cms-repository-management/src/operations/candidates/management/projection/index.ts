import type {
    IntegrationRegistryCandidateObjects,
    IntegrationRegistryCandidateRecord,
} from "@bernouy/cms-integration-registry";
import { projectCandidateStatus } from "../../contracts";
import { projectCandidateCompatibility } from "./compatibility";
import { projectCandidateMigrations } from "./migrations";
import { projectCandidateVerification } from "./verification";

export const REPOSITORY_CANDIDATE_REPORT_SCHEMA = "cms.repository.management.candidate-report.v1" as const;

export async function projectCandidateReport(
    record: IntegrationRegistryCandidateRecord,
    objects: IntegrationRegistryCandidateObjects,
) {
    assertObjectIdentity(record, objects);
    const verificationResult = objects.admissionJobResult?.verification ?? objects.verificationJobResult;
    const migrationResults = objects.admissionJobResult?.migrations ?? [];
    return {
        schema: REPOSITORY_CANDIDATE_REPORT_SCHEMA,
        candidate: projectCandidateStatus(record),
        ...(objects.compatibilityReport
            ? { compatibility: projectCandidateCompatibility(objects.compatibilityReport) }
            : {}),
        ...(objects.admission
            ? { verification: await projectCandidateVerification(objects.admission, verificationResult) }
            : {}),
        migrations: await projectCandidateMigrations(
            objects.migrationInputs,
            migrationResults,
            record.migrationInputDigests ?? [],
        ),
    };
}

function assertObjectIdentity(
    record: IntegrationRegistryCandidateRecord,
    objects: IntegrationRegistryCandidateObjects,
): void {
    if (
        objects.package.kind !== record.kind ||
        objects.package.version !== record.version ||
        objects.verification.target.kind !== record.kind ||
        objects.verification.target.version !== record.version ||
        objects.verification.target.packageDigest !== record.packageDigest
    ) {
        throw new TypeError("Candidate report objects substitute its immutable identity");
    }
    const compatibility = objects.compatibilityReport;
    if (
        compatibility &&
        (compatibility.kind !== record.kind ||
            compatibility.version !== record.version ||
            compatibility.packageDigest !== record.packageDigest)
    ) {
        throw new TypeError("Candidate compatibility report substitutes its immutable identity");
    }
    const admission = objects.admission;
    if (
        admission &&
        (admission.candidate.candidateId !== record.candidateId ||
            admission.candidate.candidateDigest !== record.candidateDigest ||
            admission.candidate.kind !== record.kind ||
            admission.candidate.version !== record.version ||
            admission.candidate.packageDigest !== record.packageDigest ||
            admission.candidate.verificationDigest !== record.verificationDigest)
    ) {
        throw new TypeError("Candidate admission report substitutes its immutable identity");
    }
    if (
        objects.migrationInputs.some(
            (input) =>
                input.target.kind !== record.kind ||
                input.target.version !== record.version ||
                input.target.packageDigest !== record.packageDigest,
        )
    ) {
        throw new TypeError("Candidate migration report substitutes its immutable target");
    }
}
