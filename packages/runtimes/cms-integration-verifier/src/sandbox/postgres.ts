import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { identifyAdmissionInputSnapshot, type VerificationJobResultV1 } from "@bernouy/cms-integration-verification";
import type { VerificationSandboxInput } from "../supervisor";

export type PostgresSqlApplicationEvidence = Readonly<{
    observedSchemaDigest: string;
    evidenceDigest: string;
    durationMs: number;
}>;

export interface PostgresInstallAndReapplyAdapter {
    environmentVersions(signal: AbortSignal): Promise<readonly Readonly<{ name: string; version: string }>[]>;
    applyPackageSql(
        input: Readonly<{
            package: VerificationSandboxInput["workload"]["package"];
            database: VerificationSandboxInput["database"];
            phase: "install" | "reapply";
        }>,
        signal: AbortSignal,
    ): Promise<PostgresSqlApplicationEvidence>;
    dispose?(): Promise<void>;
}

export async function runPostgresInstallAndReapply(
    input: VerificationSandboxInput,
    adapter: PostgresInstallAndReapplyAdapter,
    suiteId: string,
    signal: AbortSignal,
): Promise<VerificationJobResultV1> {
    const suite = input.workload.admission.suites.find((entry) => entry.suiteId === suiteId);
    if (!suite || suite.source !== "platform") {
        throw new TypeError("PostgreSQL install-and-reapply suite is not part of the exact admission plan");
    }
    const install = await adapter.applyPackageSql(
        { package: input.workload.package, database: input.database, phase: "install" },
        signal,
    );
    const reapply = await adapter.applyPackageSql(
        { package: input.workload.package, database: input.database, phase: "reapply" },
        signal,
    );
    const environmentVersions = [...(await adapter.environmentVersions(signal))].toSorted((left, right) =>
        left.name.localeCompare(right.name),
    );
    const idempotent = install.observedSchemaDigest === reapply.observedSchemaDigest;
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
        results: input.workload.admission.suites.map((planned) =>
            planned.suiteId === suiteId
                ? {
                      suiteId,
                      outcome: idempotent ? "passed" : "failed",
                      durationMs: install.durationMs + reapply.durationMs,
                      attempts: 1,
                      cacheHit: false,
                      evidenceDigests: [...new Set([install.evidenceDigest, reapply.evidenceDigest])].toSorted(),
                      diagnostics: idempotent
                          ? []
                          : [
                                {
                                    code: "postgres-reapply-changed-schema",
                                    message: "Reapplying the package SQL changed the observed schema digest",
                                    redacted: true,
                                },
                            ],
                  }
                : {
                      suiteId: planned.suiteId,
                      outcome: "skipped",
                      durationMs: 0,
                      attempts: 1,
                      cacheHit: false,
                      evidenceDigests: [],
                      diagnostics: [
                          {
                              code: "suite-not-supported-by-postgres-runner",
                              message: "This runner only executes the generated PostgreSQL install-and-reapply suite",
                              redacted: true,
                          },
                      ],
                  },
        ),
    };
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
        dependencyDigests: admission.dependencies.map((entry) => entry.packageDigest).toSorted(),
        activeContractDigests: admission.activeContracts.map((entry) => entry.contractDigest).toSorted(),
        suiteContentDigests: admission.suites.map((entry) => entry.contentDigest).toSorted(),
        catalogRevisionDigest: admission.catalogRevision.digest,
        compatibilityRevisionDigest: admission.compatibilityRevision.digest,
        compatibilityEvaluatorInputDigest: admission.compatibilityRevision.evaluatorInputDigest,
    };
}
