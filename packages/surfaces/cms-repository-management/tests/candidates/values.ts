import {
    canonicalJsonBytes,
    computeIntegrationPackageDigest,
    sha256Hex,
    type IntegrationPackageEnvelopeV1,
} from "@bernouy/cms-integration-packages";
import {
    identifyAdmissionInputSnapshot,
    identifyReleaseAdmissionPolicySnapshot,
    validateIntegrationCandidateEnvelope,
    type AdmissionInputSnapshotV1,
    type CandidateAdmissionJobResultV1,
    type ReleaseAdmissionPolicySnapshotV1,
    type ValidatedIntegrationCandidateEnvelopeV1,
} from "@bernouy/cms-integration-verification";

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
    candidateId: string,
    candidate: ValidatedIntegrationCandidateEnvelopeV1,
    policy: ReleaseAdmissionPolicySnapshotV1,
): Promise<AdmissionInputSnapshotV1> {
    return {
        schema: "cms.integration.admission-input.v1",
        candidate: {
            candidateId,
            candidateDigest: candidate.candidateDigest,
            kind: candidate.envelope.package.kind,
            version: candidate.envelope.package.version,
            packageDigest: candidate.packageDigest,
            verificationDigest: candidate.verificationDigest,
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
    candidateId: string,
    candidate: ValidatedIntegrationCandidateEnvelopeV1,
    attempt: { jobId: string; attemptId: string; fencingToken: number },
): Promise<CandidateAdmissionJobResultV1> {
    const policy = await candidatePolicy();
    const admission = await candidateAdmission(candidateId, candidate, policy);
    const versions = [{ name: "postgres", version: "16.4" }];
    return {
        schema: "cms.integration.candidate-admission-job-result.v1",
        verification: {
            schema: "cms.integration.verification-job-result.v1",
            candidateId,
            ...attempt,
            bindings: {
                admissionDigest: (await identifyAdmissionInputSnapshot(admission)).digest,
                candidateDigest: candidate.candidateDigest,
                packageDigest: candidate.packageDigest,
                verificationDigest: candidate.verificationDigest,
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
                    outcome: "passed",
                    durationMs: 10,
                    attempts: 1,
                    cacheHit: false,
                    evidenceDigests: ["e".repeat(64)],
                    diagnostics: [],
                },
            ],
        },
        migrations: [],
    };
}

export async function candidateValue(): Promise<ValidatedIntegrationCandidateEnvelopeV1> {
    const packageEnvelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind: "example",
        version: "1.2.0",
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: "{}" },
            "release-notes.md": { encoding: "utf8", content: "Release" },
        },
    };
    const packageDigest = await computeIntegrationPackageDigest(packageEnvelope);
    return await validateIntegrationCandidateEnvelope({
        schema: "cms.integration.candidate.v1",
        package: packageEnvelope,
        verification: {
            schema: "cms.integration.verification.v1",
            target: { kind: "example", version: "1.2.0", packageDigest },
            manifest: {
                runnerRequirements: [{ name: "cms-postgres", versionRange: "^1.0.0" }],
                contracts: [],
                conformance: [],
                fixtures: [],
            },
            files: {},
        },
        submission: { requestedChannel: "latest" },
    });
}

function candidateRunner() {
    return { name: "cms-postgres", version: "1.0.0", imageDigest: `sha256:${"f".repeat(64)}` } as const;
}
