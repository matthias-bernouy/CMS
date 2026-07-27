import {
    identifyCompatibilityReportV2,
    identifyReleaseAdmissionPolicySnapshot,
    identifyMigrationVerificationInput,
    identifyStatefulChangeSelection,
    validateAdmissionInputSnapshotForPolicy,
    type AdmissionInputSnapshotV1,
    type CompatibilityReportV2,
    type ReleaseAdmissionPolicySnapshotV1,
    type StatefulChangeSelectionV1,
} from "@bernouy/cms-integration-verification";
import type {
    IntegrationRegistryCandidateRecord,
    QueueIntegrationRegistryCandidateInput,
} from "../../../../interfaces/publication";
import {
    assertCandidateRevision,
    assertCandidateTransition,
    invalidCandidate,
    monotonicCandidateTimestamp,
    nextCandidateRecord,
} from "./shared";

export async function queueIntegrationRegistryCandidate(
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{
        expectedRevision: number;
        now: string;
        policy: ReleaseAdmissionPolicySnapshotV1;
        admission: AdmissionInputSnapshotV1;
        migrationInputs: QueueIntegrationRegistryCandidateInput["migrationInputs"];
        planningArtifacts?: QueueIntegrationRegistryCandidateInput["planningArtifacts"];
    }>,
): Promise<IntegrationRegistryCandidateRecord> {
    assertCandidateRevision(record, input.expectedRevision);
    assertCandidateTransition(record, ["validating"], "queued");
    const now = monotonicCandidateTimestamp(record, input.now);
    if (Date.parse(now) >= Date.parse(record.expiresAt)) {
        invalidCandidate("Expired candidate cannot be queued");
    }
    const policy = await identifyReleaseAdmissionPolicySnapshot(input.policy);
    const admission = await validateAdmissionInputSnapshotForPolicy(input.admission, policy.snapshot);
    assertAdmissionCandidate(record, admission.snapshot.candidate);
    const planningArtifacts = input.planningArtifacts;
    const migrationInputs = await Promise.all((input.migrationInputs ?? []).map(identifyMigrationVerificationInput));
    const migrationInputDigests = migrationInputs.map((entry) => entry.digest).toSorted();
    if (migrationInputDigests.some((digest, index) => digest === migrationInputDigests[index - 1])) {
        invalidCandidate("Candidate migration inputs must be unique");
    }
    const planning = planningArtifacts
        ? {
              compatibility: await identifyCompatibilityReportV2(planningArtifacts.compatibilityReport),
              stateful: await identifyStatefulChangeSelection(planningArtifacts.statefulChanges),
          }
        : undefined;
    if (planning && planningArtifacts) {
        assertPlanningArtifacts(
            record,
            admission.snapshot,
            policy.snapshot,
            policy.digest,
            planningArtifacts.compatibilityEvaluatorInputDigest,
            planning.compatibility.report,
            planning.compatibility.digest,
            planning.stateful.selection,
        );
    }
    return nextCandidateRecord(record, {
        status: "queued",
        updatedAt: now,
        policyDigest: policy.digest,
        admissionInputDigest: admission.digest,
        migrationInputDigests,
        ...(planning
            ? {
                  compatibilityReportDigest: planning.compatibility.digest,
                  statefulChangeSelectionDigest: planning.stateful.digest,
              }
            : {}),
    });
}

function assertPlanningArtifacts(
    record: IntegrationRegistryCandidateRecord,
    admission: AdmissionInputSnapshotV1,
    policy: ReleaseAdmissionPolicySnapshotV1,
    policyDigest: string,
    evaluatorInputDigest: string,
    report: CompatibilityReportV2,
    reportDigest: string,
    selection: StatefulChangeSelectionV1,
): void {
    if (
        report.kind !== record.kind ||
        report.version !== record.version ||
        report.packageDigest !== record.packageDigest ||
        !samePolicyIdentity(report.evaluator, policy.staticEvaluator) ||
        admission.compatibilityRevision.revisionId !== report.reportId ||
        admission.compatibilityRevision.digest !== reportDigest ||
        admission.compatibilityRevision.evaluatorInputDigest !== evaluatorInputDigest ||
        selection.target.kind !== record.kind ||
        selection.target.version !== record.version ||
        selection.target.packageDigest !== record.packageDigest ||
        !samePolicyIdentity(selection.selector, policy.migrationPolicy) ||
        selection.policySnapshotDigest !== policyDigest ||
        selection.compatibilityReport.revisionId !== report.reportId ||
        selection.compatibilityReport.reportDigest !== reportDigest
    ) {
        invalidCandidate("Candidate planning artifacts do not bind the exact admission input");
    }
}

function samePolicyIdentity(
    left: Readonly<{ name: string; version: string }>,
    right: Readonly<{ name: string; version: string }>,
): boolean {
    return left.name === right.name && left.version === right.version;
}

export function assertAdmissionCandidate(
    record: IntegrationRegistryCandidateRecord,
    candidate: AdmissionInputSnapshotV1["candidate"],
): void {
    if (
        candidate.candidateId !== record.candidateId ||
        candidate.candidateDigest !== record.candidateDigest ||
        candidate.kind !== record.kind ||
        candidate.version !== record.version ||
        candidate.packageDigest !== record.packageDigest ||
        candidate.verificationDigest !== record.verificationDigest
    ) {
        invalidCandidate("Admission snapshot does not bind the exact candidate identity");
    }
}
