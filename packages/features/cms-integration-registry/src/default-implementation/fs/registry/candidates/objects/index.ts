import type {
    AdmissionInputSnapshotV1,
    ReleaseAdmissionPolicySnapshotV1,
    VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import {
    validateAdmissionInputSnapshotForPolicy,
    validateIntegrationCandidateEnvelope,
    validateVerificationJobResultForAdmission,
} from "@bernouy/cms-integration-verification";
import type {
    IntegrationRegistryCandidateObjects,
    IntegrationRegistryCandidateRecord,
} from "cms-integration-registry/interfaces/publication";
import type { FsIntegrationRegistryCandidateLayout } from "../layout";
import { readCandidateAdmission, readCandidatePolicy, readCandidateVerificationJobResult } from "./control";
import { readCandidatePackage, readCandidateVerification } from "./package";

export {
    persistCandidateAdmissionObjects,
    persistCandidateVerificationJobResult,
    readCandidateAdmission,
    readCandidatePolicy,
    readCandidateVerificationJobResult,
} from "./control";
export { persistCandidatePackageObjects, readCandidatePackage, readCandidateVerification } from "./package";
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
    let verificationJobResult: VerificationJobResultV1 | undefined;
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
    if (record.verificationJobResultDigest) {
        verificationJobResult = await readCandidateVerificationJobResult(layout, record.verificationJobResultDigest);
        if (!policy || !admission) {
            throw new Error(`Candidate ${record.candidateId} result is missing persisted admission inputs`);
        }
        const identified = await validateVerificationJobResultForAdmission(verificationJobResult, admission, policy, {
            jobId: verificationJobResult.jobId,
            attemptId: verificationJobResult.attemptId,
            fencingToken: verificationJobResult.fencingToken,
        });
        if (
            identified.digest !== record.verificationJobResultDigest ||
            verificationJobResult.fencingToken > record.attemptCount ||
            (record.status !== "running" && verificationJobResult.fencingToken !== record.attemptCount)
        ) {
            throw new Error(`Candidate ${record.candidateId} result does not match its record attempt`);
        }
    }
    return Object.freeze({
        package: packageEnvelope,
        verification,
        ...(policy ? { policy } : {}),
        ...(admission ? { admission } : {}),
        ...(verificationJobResult ? { verificationJobResult } : {}),
    });
}
