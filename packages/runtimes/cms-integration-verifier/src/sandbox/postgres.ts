import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyAdmissionInputSnapshot,
    parsePlatformVerificationEvidence,
    type BehavioralRlsPlanV1,
    type CandidateAdmissionJobResultV1,
    type MigrationJobResultV1,
    type PlatformVerificationEvidenceV1,
    type VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import type { VerificationSandboxInput } from "../supervisor";

export type PostgresPlatformVerificationEvidence = Readonly<{
    durationMs: number;
    suites: readonly PlatformVerificationEvidenceV1[];
}>;

export type PostgresAuthorVerificationEvidence = Readonly<{
    suiteId: string;
    suiteDigest: string;
    outcome: "passed" | "failed" | "infrastructure-failure";
    durationMs: number;
    evidenceDigest?: string;
    diagnosticCode?: string;
}>;

export interface PostgresPlatformVerificationAdapter {
    environmentVersions(signal: AbortSignal): Promise<readonly Readonly<{ name: string; version: string }>[]>;
    verifyPackage(
        input: Readonly<{
            package: VerificationSandboxInput["workload"]["package"];
            dependencies: VerificationSandboxInput["workload"]["admission"]["dependencies"];
            dependencyPackages: VerificationSandboxInput["workload"]["dependencyPackages"];
            behavioralRlsPlan?: BehavioralRlsPlanV1;
            database: VerificationSandboxInput["database"];
            platformSuites: readonly Readonly<{
                suiteId: string;
                suiteDigest: string;
                applicable: boolean;
            }>[];
        }>,
        signal: AbortSignal,
    ): Promise<PostgresPlatformVerificationEvidence>;
    verifyAuthorSuites?(
        input: Readonly<{
            suites: VerificationSandboxInput["workload"]["authorSuites"];
            database: VerificationSandboxInput["database"];
        }>,
        signal: AbortSignal,
    ): Promise<readonly PostgresAuthorVerificationEvidence[]>;
    verifyMigrations?(
        input: Readonly<{
            package: VerificationSandboxInput["workload"]["package"];
            migrationPackages: VerificationSandboxInput["workload"]["migrationPackages"];
            migrationInputs: VerificationSandboxInput["workload"]["migrationInputs"];
            attempt: VerificationSandboxInput["workload"]["attempt"];
            database: VerificationSandboxInput["database"];
        }>,
        signal: AbortSignal,
    ): Promise<readonly MigrationJobResultV1[]>;
    dispose?(): Promise<void>;
}

export async function runPostgresPlatformVerification(
    input: VerificationSandboxInput,
    adapter: PostgresPlatformVerificationAdapter,
    signal: AbortSignal,
): Promise<CandidateAdmissionJobResultV1> {
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
            dependencyPackages: input.workload.dependencyPackages,
            ...(input.workload.behavioralRlsPlan ? { behavioralRlsPlan: input.workload.behavioralRlsPlan.plan } : {}),
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
    const plannedAuthor = input.workload.authorSuites;
    if (plannedAuthor.length > 0 && !adapter.verifyAuthorSuites) {
        throw new TypeError("PostgreSQL verification adapter cannot execute required author suites");
    }
    const authorExecution = adapter.verifyAuthorSuites
        ? await adapter.verifyAuthorSuites({ suites: plannedAuthor, database: input.database }, signal)
        : [];
    const authorEvidence = new Map(authorExecution.map((entry) => [entry.suiteId, entry] as const));
    if (authorEvidence.size !== authorExecution.length || authorEvidence.size !== plannedAuthor.length) {
        throw new TypeError("PostgreSQL verification adapter did not return every and only planned author suite");
    }
    const environmentVersions = [...(await adapter.environmentVersions(signal))].toSorted((left, right) =>
        left.name.localeCompare(right.name),
    );
    const admissionDigest = (await identifyAdmissionInputSnapshot(input.workload.admission)).digest;
    const verification: VerificationJobResultV1 = {
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
                    const proof = authorEvidence.get(planned.suiteId);
                    if (
                        !proof ||
                        proof.suiteDigest !== planned.contentDigest ||
                        ((proof.outcome === "passed" || proof.outcome === "failed") && !proof.evidenceDigest) ||
                        (proof.outcome === "infrastructure-failure" && !proof.diagnosticCode)
                    ) {
                        throw new TypeError(
                            `PostgreSQL author verification evidence does not match ${planned.suiteId}`,
                        );
                    }
                    return {
                        suiteId: planned.suiteId,
                        outcome: proof.outcome,
                        durationMs: proof.durationMs,
                        attempts: 1,
                        cacheHit: false,
                        evidenceDigests: proof.evidenceDigest ? [proof.evidenceDigest] : [],
                        diagnostics: authorDiagnostics(proof),
                    };
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
    let migrations: readonly MigrationJobResultV1[] = [];
    const migrationInputs = input.workload.migrationInputs ?? [];
    if (migrationInputs.length > 0) {
        if (!adapter.verifyMigrations) {
            throw new TypeError("PostgreSQL verification adapter cannot execute required migration proofs");
        }
        migrations = await adapter.verifyMigrations(
            {
                package: input.workload.package,
                migrationPackages: input.workload.migrationPackages,
                migrationInputs,
                attempt: input.workload.attempt,
                database: input.database,
            },
            signal,
        );
    }
    return {
        schema: "cms.integration.candidate-admission-job-result.v1",
        verification,
        migrations,
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

function authorDiagnostics(
    evidence: PostgresAuthorVerificationEvidence,
): VerificationJobResultV1["results"][number]["diagnostics"] {
    if (evidence.outcome === "passed") {
        return [];
    }
    return [
        {
            code: evidence.diagnosticCode ?? "author-suite-failed",
            message:
                evidence.outcome === "infrastructure-failure"
                    ? "The isolated author suite runtime did not complete"
                    : "One or more isolated author verification tests failed",
            redacted: true,
        },
    ];
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
        ...(admission.behavioralRlsPlan ? { behavioralRlsPlanDigest: admission.behavioralRlsPlan.digest } : {}),
    };
}
