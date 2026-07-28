import {
    composeReleaseAdmissionDecision,
    identifyAdmissionInputSnapshot,
    identifyReleaseAdmissionPolicySnapshot,
    identifyStatefulChangeSelection,
    identifyVerificationJobResult,
    identifyVerificationReport,
    type AdmissionInputSnapshotV1,
    type CompatibilityReportV2,
    type MigrationReport,
    type ReleaseAdmissionDecision,
    type ReleaseAdmissionPolicySnapshotV1,
    type StatefulChangeSelectionV1,
    type VerificationJobResultV1,
    type VerificationReport,
} from "@bernouy/cms-integration-verification";

export async function buildCandidateReleaseEvidence(
    input: Readonly<{
        candidateId: string;
        candidateDigest: string;
        createdAt: string;
        policy: ReleaseAdmissionPolicySnapshotV1;
        admission: AdmissionInputSnapshotV1;
        compatibility: CompatibilityReportV2;
        statefulChanges: StatefulChangeSelectionV1;
        result: VerificationJobResultV1;
        migrations: readonly MigrationReport[];
        createDecisionId(candidateId: string): string;
    }>,
): Promise<Readonly<{ verification: VerificationReport; decision: ReleaseAdmissionDecision }>> {
    const policy = await identifyReleaseAdmissionPolicySnapshot(input.policy);
    const admission = await identifyAdmissionInputSnapshot(input.admission);
    const result = await identifyVerificationJobResult(input.result);
    const statefulChanges = await identifyStatefulChangeSelection(input.statefulChanges);
    const suitePlan = new Map(admission.snapshot.suites.map((suite) => [suite.suiteId, suite]));
    const verification = await identifyVerificationReport({
        schema: "cms.integration.verification-report.v1",
        reportId: `verify-${input.candidateDigest.slice(0, 32)}`,
        revisionType: "root",
        origin: "admission",
        createdAt: input.createdAt,
        kind: admission.snapshot.candidate.kind,
        version: admission.snapshot.candidate.version,
        packageDigest: admission.snapshot.candidate.packageDigest,
        verificationDigest: admission.snapshot.candidate.verificationDigest,
        runner: result.result.runner,
        policy: statefulChanges.selection.selector,
        policySnapshotDigest: policy.digest,
        admissionInputDigest: admission.digest,
        verificationJobResultDigest: result.digest,
        dependencies: admission.snapshot.dependencies,
        baselines: admission.snapshot.reviewedBaselines,
        activeContracts: admission.snapshot.activeContracts.map((contract) => ({
            contractId: contract.contractId,
            ownerVersion: contract.ownerVersion,
            digest: contract.contractDigest,
        })),
        environment: {
            digest: result.result.environment.digest,
            versions: Object.fromEntries(
                result.result.environment.versions.map(({ name, version }) => [name, version]),
            ),
        },
        results: result.result.results.map((entry) => {
            const planned = suitePlan.get(entry.suiteId);
            if (!planned) {
                throw new TypeError(`Verification result contains unplanned suite ${entry.suiteId}`);
            }
            return {
                ...entry,
                source: planned.source,
                required: true,
                ...(planned.applicable === undefined ? {} : { applicable: planned.applicable }),
            };
        }),
        outcome: result.result.results.some((entry) => entry.outcome === "infrastructure-failure")
            ? "infrastructure-failure"
            : result.result.results.some((entry) => entry.outcome === "failed" || entry.outcome === "skipped")
              ? "failed"
              : "passed",
        provenance: {
            actor: "repository-verifier",
            reason: "candidate-admission",
            evidenceIds: [result.result.jobId, result.result.attemptId],
        },
    });
    const decision = await composeReleaseAdmissionDecision({
        decisionId: input.createDecisionId(input.candidateId),
        revisionType: "root",
        compatibility: input.compatibility,
        verification: verification.report,
        migrations: input.migrations,
        statefulChanges,
        policy: statefulChanges.selection.selector,
        policySnapshotDigest: policy.digest,
        createdAt: input.createdAt,
        provenance: {
            actor: "repository-admission",
            reason: "candidate-evidence-composition",
            evidenceIds: [input.candidateId],
        },
    });
    return Object.freeze({ verification: verification.report, decision });
}
