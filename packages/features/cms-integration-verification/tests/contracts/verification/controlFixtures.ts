import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type {
    AdmissionInputSnapshotV1,
    ReleaseAdmissionPolicySnapshotV1,
    VerificationJobAttemptIdentityV1,
    VerificationJobResultV1,
} from "../../../src/exports/index";
import { identifyAdmissionInputSnapshot, identifyReleaseAdmissionPolicySnapshot } from "../../../src/exports/index";
import { DIGEST_A, DIGEST_B, DIGEST_C, IMAGE_A, runner } from "../fixtures";

export const DIGEST_D = "d".repeat(64);
export const DIGEST_E = "e".repeat(64);
export const DIGEST_F = "f".repeat(64);
export const DIGEST_ZERO = "0".repeat(64);
export const IMAGE_B = `sha256:${DIGEST_B}`;

export const ATTEMPT: VerificationJobAttemptIdentityV1 = {
    jobId: "job-1",
    attemptId: "attempt-1",
    fencingToken: 3,
};

export async function policySnapshot(): Promise<ReleaseAdmissionPolicySnapshotV1> {
    const postgres = runner();
    const deno = { name: "cms-deno", version: "2.0.0", imageDigest: IMAGE_B } as const;
    const postgresDigest = await sha256Hex(canonicalJsonBytes(postgres));
    return {
        schema: "cms.integration.release-admission-policy.v1",
        identity: { name: "global-admission", version: "1.4.0" },
        staticEvaluator: { name: "static-compatibility", version: "2.1.0" },
        verificationPolicy: { name: "integration-verification", version: "1.3.0" },
        migrationPolicy: { name: "integration-migration", version: "1.1.0" },
        approvedRunners: [deno, postgres],
        platformRequiredSuites: [
            { suiteId: "deno-contract", suiteDigest: DIGEST_F, runner: deno },
            { suiteId: "platform-install", suiteDigest: DIGEST_C, runner: postgres },
        ],
        findingResolutionRules: [
            {
                surface: "schema",
                code: "check-semantics-unproven",
                proofTypes: ["postgres-equivalence", "postgres-introspection"],
                producers: ["schema-verifier", "trusted-review"],
                runnerDigests: [postgresDigest],
            },
        ],
        retry: { maximumAttempts: 3, retryableOutcomes: ["infrastructure-failure"] },
        cache: { mode: "passed-only", minimumConcordantRuns: 2, maximumAgeSeconds: 3_600 },
        migrationEvidence: {
            requiredForReleaseLevels: ["major", "minor"],
            requiredChecks: ["migrated-state", "fresh-install", "equivalence"],
            requireExactSourcePackageDigest: true,
            requireExactTargetPackageDigest: true,
            requireCmsMediatedCutoverEvidence: true,
            requireProviderDirectCutoverEvidence: true,
            requireRollbackEvidence: true,
            requireDelayedCleanupEvidence: true,
        },
    };
}

export async function admissionSnapshot(policy?: ReleaseAdmissionPolicySnapshotV1): Promise<AdmissionInputSnapshotV1> {
    const selectedPolicy = policy ?? (await policySnapshot());
    const policyDigest = (await identifyReleaseAdmissionPolicySnapshot(selectedPolicy)).digest;
    return {
        schema: "cms.integration.admission-input.v1",
        candidate: {
            candidateId: "candidate-1",
            candidateDigest: DIGEST_A,
            kind: "example",
            version: "1.2.0",
            packageDigest: DIGEST_B,
            verificationDigest: DIGEST_C,
        },
        policyDigest,
        selectedRunner: runner(),
        reviewedBaselines: [
            {
                kind: "example",
                version: "1.1.0",
                packageDigest: DIGEST_C,
                connectorKey: "primary",
                lineageId: "example-supabase-v1",
                revisionId: "baseline-1",
                baselineDigest: DIGEST_D,
                observedSchemaDigest: DIGEST_E,
            },
        ],
        dependencies: [{ kind: "dependency", version: "2.0.0", packageDigest: DIGEST_F }],
        activeContracts: [
            {
                contractId: "public-contract",
                lineageId: "example-public-v1",
                ownerVersion: "1.1.0",
                contractDigest: DIGEST_ZERO,
            },
        ],
        suites: [
            { suiteId: "implementation", source: "author-conformance", contentDigest: DIGEST_A },
            { suiteId: "public-contract", source: "author-contract", contentDigest: DIGEST_ZERO },
            { suiteId: "platform-install", source: "platform", contentDigest: DIGEST_C },
        ],
        catalogRevision: { revisionId: "catalog-7", digest: DIGEST_B },
        compatibilityRevision: {
            revisionId: "compatibility-4",
            digest: DIGEST_C,
            evaluatorInputDigest: DIGEST_D,
        },
    };
}

export async function jobResult(
    policy?: ReleaseAdmissionPolicySnapshotV1,
    admission?: AdmissionInputSnapshotV1,
): Promise<VerificationJobResultV1> {
    const selectedPolicy = policy ?? (await policySnapshot());
    const selectedAdmission = admission ?? (await admissionSnapshot(selectedPolicy));
    const admissionDigest = (await identifyAdmissionInputSnapshot(selectedAdmission)).digest;
    const versions = [
        { name: "bun", version: "1.3.14" },
        { name: "postgres", version: "16.4" },
    ];
    return {
        schema: "cms.integration.verification-job-result.v1",
        candidateId: selectedAdmission.candidate.candidateId,
        ...ATTEMPT,
        bindings: {
            admissionDigest,
            candidateDigest: selectedAdmission.candidate.candidateDigest,
            packageDigest: selectedAdmission.candidate.packageDigest,
            verificationDigest: selectedAdmission.candidate.verificationDigest,
            policyDigest: selectedAdmission.policyDigest,
            reviewedBaselineRevisionIds: selectedAdmission.reviewedBaselines.map((entry) => entry.revisionId),
            reviewedBaselineDigests: selectedAdmission.reviewedBaselines.map((entry) => entry.baselineDigest),
            reviewedObservedSchemaDigests: selectedAdmission.reviewedBaselines.map(
                (entry) => entry.observedSchemaDigest,
            ),
            dependencyDigests: selectedAdmission.dependencies.map((entry) => entry.packageDigest),
            activeContractDigests: selectedAdmission.activeContracts.map((entry) => entry.contractDigest),
            suiteContentDigests: selectedAdmission.suites.map((entry) => entry.contentDigest),
            catalogRevisionDigest: selectedAdmission.catalogRevision.digest,
            compatibilityRevisionDigest: selectedAdmission.compatibilityRevision.digest,
            compatibilityEvaluatorInputDigest: selectedAdmission.compatibilityRevision.evaluatorInputDigest,
        },
        runner: selectedAdmission.selectedRunner,
        environment: { digest: await sha256Hex(canonicalJsonBytes(versions)), versions },
        results: selectedAdmission.suites.map((suite) => ({
            suiteId: suite.suiteId,
            outcome: "passed",
            durationMs: 12,
            attempts: 1,
            cacheHit: false,
            evidenceDigests: [suite.contentDigest],
            diagnostics: [],
        })),
    };
}
