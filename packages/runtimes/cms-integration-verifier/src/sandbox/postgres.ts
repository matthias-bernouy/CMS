import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyAdmissionInputSnapshot,
    parsePlatformVerificationEvidence,
    type PlatformVerificationEvidenceV1,
    type VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import type { VerificationSandboxInput } from "../supervisor";

export type PostgresPlatformVerificationEvidence = Readonly<{
    durationMs: number;
    suites: readonly PlatformVerificationEvidenceV1[];
}>;

export interface PostgresPlatformVerificationAdapter {
    environmentVersions(signal: AbortSignal): Promise<readonly Readonly<{ name: string; version: string }>[]>;
    verifyPackage(
        input: Readonly<{
            package: VerificationSandboxInput["workload"]["package"];
            dependencies: VerificationSandboxInput["workload"]["admission"]["dependencies"];
            database: VerificationSandboxInput["database"];
            platformSuites: readonly Readonly<{
                suiteId: string;
                suiteDigest: string;
                applicable: boolean;
            }>[];
        }>,
        signal: AbortSignal,
    ): Promise<PostgresPlatformVerificationEvidence>;
    dispose?(): Promise<void>;
}

export async function runPostgresPlatformVerification(
    input: VerificationSandboxInput,
    adapter: PostgresPlatformVerificationAdapter,
    signal: AbortSignal,
): Promise<VerificationJobResultV1> {
    const plannedPlatform = input.workload.admission.suites
        .filter((entry) => entry.source === "platform")
        .map((entry) => ({
            suiteId: entry.suiteId,
            suiteDigest: entry.contentDigest,
            applicable: entry.applicable !== false,
        }));
    const execution = await adapter.verifyPackage(
        {
            package: input.workload.package,
            dependencies: input.workload.admission.dependencies,
            database: input.database,
            platformSuites: plannedPlatform,
        },
        signal,
    );
    const evidence = new Map(
        execution.suites.map((entry) => {
            const parsed = parsePlatformVerificationEvidence(entry);
            return [parsed.suiteId, parsed] as const;
        }),
    );
    if (evidence.size !== execution.suites.length || evidence.size !== plannedPlatform.length) {
        throw new TypeError("PostgreSQL verification adapter did not return every and only planned platform suite");
    }
    const environmentVersions = [...(await adapter.environmentVersions(signal))].toSorted((left, right) =>
        left.name.localeCompare(right.name),
    );
    const admissionDigest = (await identifyAdmissionInputSnapshot(input.workload.admission)).digest;
    return {
        schema: "cms.integration.verification-job-result.v1",
        candidateId: input.workload.admission.candidate.candidateId,
        ...input.workload.attempt,
        bindings: resultBindings(input, admissionDigest),
        runner: input.workload.admission.selectedRunner,
        environment: {
            digest: await sha256Hex(canonicalJsonBytes(environmentVersions)),
            versions: environmentVersions,
        },
        results: await Promise.all(
            input.workload.admission.suites.map(async (planned) => {
                if (planned.source !== "platform") {
                    return unsupportedAuthorSuite(planned.suiteId);
                }
                const proof = evidence.get(planned.suiteId);
                if (
                    !proof ||
                    proof.suiteDigest !== planned.contentDigest ||
                    (proof.outcome === "not-applicable") !== (planned.applicable === false)
                ) {
                    throw new TypeError(`PostgreSQL verification evidence does not match ${planned.suiteId}`);
                }
                const evidenceDigest = await sha256Hex(canonicalJsonBytes(proof));
                return {
                    suiteId: planned.suiteId,
                    outcome: proof.outcome,
                    durationMs: execution.durationMs,
                    attempts: 1,
                    cacheHit: false,
                    evidenceDigests: [evidenceDigest],
                    diagnostics: diagnostics(proof),
                    platformEvidence: proof,
                };
            }),
        ),
    };
}

function unsupportedAuthorSuite(suiteId: string): VerificationJobResultV1["results"][number] {
    return {
        suiteId,
        outcome: "skipped",
        durationMs: 0,
        attempts: 1,
        cacheHit: false,
        evidenceDigests: [],
        diagnostics: [
            {
                code: "author-suite-runner-unavailable",
                message: "The PostgreSQL platform runner does not execute author-provided code",
                redacted: true,
            },
        ],
    };
}

function diagnostics(
    evidence: PlatformVerificationEvidenceV1,
): VerificationJobResultV1["results"][number]["diagnostics"] {
    if (evidence.outcome === "not-applicable") {
        return [
            {
                code: "platform-suite-not-applicable",
                message: `Policy marked ${evidence.suiteId} not applicable to this exact definition`,
                redacted: true,
            },
        ];
    }
    return evidence.checks
        .flatMap((check) => check.findings.map((finding) => ({ check, finding })))
        .slice(0, 8)
        .map(({ check, finding }) => ({
            code: finding.code,
            message: `${check.checkId} rejected ${finding.path}`,
            redacted: true as const,
        }));
}

function resultBindings(input: VerificationSandboxInput, admissionDigest: string): VerificationJobResultV1["bindings"] {
    const admission = input.workload.admission;
    return {
        admissionDigest,
        candidateDigest: admission.candidate.candidateDigest,
        packageDigest: admission.candidate.packageDigest,
        verificationDigest: admission.candidate.verificationDigest,
        policyDigest: admission.policyDigest,
        reviewedBaselineRevisionIds: admission.reviewedBaselines.map((entry) => entry.revisionId).toSorted(),
        reviewedBaselineDigests: admission.reviewedBaselines.map((entry) => entry.baselineDigest).toSorted(),
        reviewedObservedSchemaDigests: admission.reviewedBaselines
            .map((entry) => entry.observedSchemaDigest)
            .toSorted(),
        dependencyDigests: [...new Set(admission.dependencies.map((entry) => entry.packageDigest))].toSorted(),
        activeContractDigests: admission.activeContracts.map((entry) => entry.contractDigest).toSorted(),
        suiteContentDigests: admission.suites.map((entry) => entry.contentDigest).toSorted(),
        catalogRevisionDigest: admission.catalogRevision.digest,
        compatibilityRevisionDigest: admission.compatibilityRevision.digest,
        compatibilityEvaluatorInputDigest: admission.compatibilityRevision.evaluatorInputDigest,
    };
}
