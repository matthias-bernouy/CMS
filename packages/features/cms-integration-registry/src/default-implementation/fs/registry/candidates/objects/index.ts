import type {
    AdmissionInputSnapshotV1,
    CompatibilityReportV2,
    ReleaseAdmissionPolicySnapshotV1,
    StatefulChangeSelectionV1,
    MigrationVerificationInputV1,
} from "@bernouy/cms-integration-verification";
import {
    identifyCompatibilityReportV2,
    identifyStatefulChangeSelection,
    validateAdmissionInputSnapshotForPolicy,
    validateIntegrationCandidateEnvelope,
} from "@bernouy/cms-integration-verification";
import type {
    IntegrationRegistryCandidateObjects,
    IntegrationRegistryCandidateRecord,
} from "cms-integration-registry/interfaces/publication";
import type { FsIntegrationRegistryCandidateLayout } from "../layout";
import { readCandidateAdmission, readCandidatePolicy } from "./control";
import { readCandidateAttemptObjects } from "./attempt";
import { readCandidateMigrationInput } from "./migration";
import { readCandidatePackage, readCandidateVerification } from "./package";
import { readCandidateCompatibilityReport, readCandidateStatefulSelection } from "./planning";

export {
    persistCandidateAdmissionObjects,
    persistCandidateAdmissionJobResult,
    readCandidateAdmission,
    readCandidateAdmissionJobResult,
    readCandidatePolicy,
} from "./control";
export { persistCandidateMigrationInputs, readCandidateMigrationInput } from "./migration";
export { persistCandidatePackageObjects, readCandidatePackage, readCandidateVerification } from "./package";
export {
    persistCandidatePlanningArtifacts,
    readCandidateCompatibilityReport,
    readCandidateStatefulSelection,
} from "./planning";
export { readCandidatePackage as readPackage, readCandidateVerification as readVerification } from "./package";
export { assertCandidateObjectCapacity } from "./shared";
export type FsIntegrationRegistryCandidateObjects = IntegrationRegistryCandidateObjects;

export async function readFsIntegrationRegistryCandidateObjects(
    layout: FsIntegrationRegistryCandidateLayout,
    record: IntegrationRegistryCandidateRecord,
): Promise<IntegrationRegistryCandidateObjects> {
    const packageEnvelope = await readCandidatePackage(layout, record.packageDigest);
    const verification = await readCandidateVerification(layout, record.verificationDigest);
    if (
        packageEnvelope.kind !== record.kind ||
        packageEnvelope.version !== record.version ||
        verification.target.kind !== record.kind ||
        verification.target.version !== record.version ||
        verification.target.packageDigest !== record.packageDigest
    ) {
        throw new Error(`Candidate ${record.candidateId} object identities do not match its record`);
    }
    const candidate = await validateIntegrationCandidateEnvelope({
        schema: "cms.integration.candidate.v1",
        package: packageEnvelope,
        verification,
        submission: record.requestedChannel ? { requestedChannel: record.requestedChannel } : {},
    });
    if (candidate.candidateDigest !== record.candidateDigest) {
        throw new Error(`Candidate ${record.candidateId} envelope does not match its record digest`);
    }
    let policy: ReleaseAdmissionPolicySnapshotV1 | undefined;
    let admission: AdmissionInputSnapshotV1 | undefined;
    let compatibilityReport: CompatibilityReportV2 | undefined;
    let statefulChanges: StatefulChangeSelectionV1 | undefined;
    let migrationInputs: readonly MigrationVerificationInputV1[] = [];
    if (record.policyDigest && record.admissionInputDigest) {
        policy = await readCandidatePolicy(layout, record.policyDigest);
        admission = await readCandidateAdmission(layout, record.admissionInputDigest);
        const identified = await validateAdmissionInputSnapshotForPolicy(admission, policy);
        if (
            identified.digest !== record.admissionInputDigest ||
            admission.candidate.candidateId !== record.candidateId ||
            admission.candidate.candidateDigest !== record.candidateDigest ||
            admission.candidate.kind !== record.kind ||
            admission.candidate.version !== record.version ||
            admission.candidate.packageDigest !== record.packageDigest ||
            admission.candidate.verificationDigest !== record.verificationDigest
        ) {
            throw new Error(`Candidate ${record.candidateId} admission inputs do not match its record`);
        }
    }
    if (record.migrationInputDigests) {
        migrationInputs = await Promise.all(
            record.migrationInputDigests.map((digest) => readCandidateMigrationInput(layout, digest)),
        );
    }
    const attempt = await readCandidateAttemptObjects(layout, record, policy, admission, migrationInputs);
    if (record.compatibilityReportDigest && record.statefulChangeSelectionDigest) {
        compatibilityReport = await readCandidateCompatibilityReport(layout, record.compatibilityReportDigest);
        statefulChanges = await readCandidateStatefulSelection(layout, record.statefulChangeSelectionDigest);
        const report = await identifyCompatibilityReportV2(compatibilityReport);
        const selection = await identifyStatefulChangeSelection(statefulChanges);
        if (
            report.digest !== record.compatibilityReportDigest ||
            selection.digest !== record.statefulChangeSelectionDigest ||
            !admission ||
            admission.compatibilityRevision.revisionId !== report.report.reportId ||
            admission.compatibilityRevision.digest !== report.digest ||
            statefulChanges.compatibilityReport.revisionId !== report.report.reportId ||
            statefulChanges.compatibilityReport.reportDigest !== report.digest ||
            statefulChanges.policySnapshotDigest !== record.policyDigest
        ) {
            throw new Error(`Candidate ${record.candidateId} planning artifacts do not match its admission input`);
        }
    }
    return Object.freeze({
        package: packageEnvelope,
        verification,
        ...(policy ? { policy } : {}),
        ...(admission ? { admission } : {}),
        ...(compatibilityReport ? { compatibilityReport } : {}),
        ...(statefulChanges ? { statefulChanges } : {}),
        migrationInputs,
        ...attempt,
    });
}
