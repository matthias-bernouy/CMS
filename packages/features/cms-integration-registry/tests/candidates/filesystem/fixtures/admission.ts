import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyAdmissionInputSnapshot,
    identifyReleaseAdmissionPolicySnapshot,
    type AdmissionInputSnapshotV1,
    type ReleaseAdmissionPolicySnapshotV1,
    type ValidatedIntegrationCandidateEnvelopeV1,
    type VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";

type CandidateIdentityFixture = Readonly<{
    candidateId: string;
    candidate: ValidatedIntegrationCandidateEnvelopeV1;
}>;

export async function candidatePolicy(): Promise<ReleaseAdmissionPolicySnapshotV1> {
    const runner = candidateRunner();
    return {
        schema: "cms.integration.release-admission-policy.v1",
        identity: { name: "candidate-admission", version: "1.0.0" },
        staticEvaluator: { name: "static-compatibility", version: "1.0.0" },
        verificationPolicy: { name: "candidate-verification", version: "1.0.0" },
        migrationPolicy: { name: "candidate-migration", version: "1.0.0" },
        approvedRunners: [runner],
        platformRequiredSuites: [{ suiteId: "platform-install", suiteDigest: "a".repeat(64), runner }],
        findingResolutionRules: [],
        retry: { maximumAttempts: 2, retryableOutcomes: ["infrastructure-failure"] },
        cache: { mode: "disabled", minimumConcordantRuns: 1, maximumAgeSeconds: 0 },
        migrationEvidence: {
            requiredForReleaseLevels: [],
            requiredChecks: [],
            requireExactSourcePackageDigest: true,
            requireExactTargetPackageDigest: true,
            requireCmsMediatedCutoverEvidence: false,
            requireProviderDirectCutoverEvidence: false,
            requireRollbackEvidence: false,
            requireDelayedCleanupEvidence: false,
        },
    };
}

export async function candidateAdmission(
    fixture: CandidateIdentityFixture,
    requestedPolicy?: ReleaseAdmissionPolicySnapshotV1,
): Promise<AdmissionInputSnapshotV1> {
    const policy = requestedPolicy ?? (await candidatePolicy());
    return {
        schema: "cms.integration.admission-input.v1",
        candidate: {
            candidateId: fixture.candidateId,
            candidateDigest: fixture.candidate.candidateDigest,
            kind: fixture.candidate.envelope.package.kind,
            version: fixture.candidate.envelope.package.version,
            packageDigest: fixture.candidate.packageDigest,
            verificationDigest: fixture.candidate.verificationDigest,
        },
        policyDigest: (await identifyReleaseAdmissionPolicySnapshot(policy)).digest,
        selectedRunner: candidateRunner(),
        reviewedBaselines: [],
        dependencies: [],
        activeContracts: [],
        suites: [{ suiteId: "platform-install", source: "platform", contentDigest: "a".repeat(64) }],
        catalogRevision: { revisionId: "catalog-1", digest: "b".repeat(64) },
        compatibilityRevision: {
            revisionId: "compatibility-1",
            digest: "c".repeat(64),
            evaluatorInputDigest: "d".repeat(64),
        },
    };
}

export async function candidateJobResult(
    fixture: CandidateIdentityFixture,
    input: Readonly<{
        jobId?: string;
        attemptId?: string;
        fencingToken?: number;
        outcome?: "passed" | "failed" | "skipped" | "infrastructure-failure";
    }> = {},
): Promise<VerificationJobResultV1> {
    const policy = await candidatePolicy();
    const admission = await candidateAdmission(fixture, policy);
    const versions = [{ name: "postgres", version: "16.4" }];
    return {
        schema: "cms.integration.verification-job-result.v1",
        candidateId: fixture.candidateId,
        jobId: input.jobId ?? "job-1",
        attemptId: input.attemptId ?? "attempt-1",
        fencingToken: input.fencingToken ?? 1,
        bindings: {
            admissionDigest: (await identifyAdmissionInputSnapshot(admission)).digest,
            candidateDigest: admission.candidate.candidateDigest,
            packageDigest: admission.candidate.packageDigest,
            verificationDigest: admission.candidate.verificationDigest,
            policyDigest: admission.policyDigest,
            reviewedBaselineRevisionIds: [],
            reviewedBaselineDigests: [],
            reviewedObservedSchemaDigests: [],
            dependencyDigests: [],
            activeContractDigests: [],
            suiteContentDigests: admission.suites.map((suite) => suite.contentDigest),
            catalogRevisionDigest: admission.catalogRevision.digest,
            compatibilityRevisionDigest: admission.compatibilityRevision.digest,
            compatibilityEvaluatorInputDigest: admission.compatibilityRevision.evaluatorInputDigest,
        },
        runner: candidateRunner(),
        environment: { digest: await sha256Hex(canonicalJsonBytes(versions)), versions },
        results: [
            {
                suiteId: "platform-install",
                outcome: input.outcome ?? "passed",
                durationMs: 10,
                attempts: 1,
                cacheHit: false,
                evidenceDigests: ["e".repeat(64)],
                diagnostics: [],
            },
        ],
    };
}

function candidateRunner() {
    return { name: "cms-postgres", version: "1.0.0", imageDigest: `sha256:${"f".repeat(64)}` } as const;
}
