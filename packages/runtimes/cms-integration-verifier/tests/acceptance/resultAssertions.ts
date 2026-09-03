import { expect } from "bun:test";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyAdmissionInputSnapshot,
    identifyCandidateAdmissionJobResult,
    identifyMigrationVerificationInput,
    identifyReleaseAdmissionPolicySnapshot,
} from "@bernouy/cms-integration-verification";
import { PRODUCTION_RUNNER } from "./fixtureResources";
import { type startOfficialCandidateAcceptance } from "./support";

type Acceptance = Awaited<ReturnType<typeof startOfficialCandidateAcceptance>>;

export async function assertExactSubmission(
    trace: Acceptance["trace"],
    candidateId: string,
    basicBlocsDigest: string,
): Promise<void> {
    if (!trace.claimed || !trace.result || !trace.capability || !trace.submitted) {
        throw new Error("Official candidate result did not cross the complete fenced protocol");
    }
    const identified = await identifyCandidateAdmissionJobResult(trace.result);
    expect(trace.capability.resultDigest).toBe(identified.digest);
    const admission = trace.claimed.workload.admission;
    const policy = await identifyReleaseAdmissionPolicySnapshot(trace.claimed.workload.policy);
    const admissionIdentity = await identifyAdmissionInputSnapshot(admission);
    expect(trace.result.verification).toMatchObject({
        candidateId,
        jobId: trace.claimed.candidate.lease.jobId,
        attemptId: trace.claimed.candidate.lease.attemptId,
        fencingToken: trace.claimed.candidate.lease.fencingToken,
        runner: PRODUCTION_RUNNER,
    });
    expect(trace.result.verification.runner).toEqual(admission.selectedRunner);
    expect(trace.result.verification.bindings).toEqual({
        admissionDigest: admissionIdentity.digest,
        candidateDigest: admission.candidate.candidateDigest,
        packageDigest: admission.candidate.packageDigest,
        verificationDigest: admission.candidate.verificationDigest,
        policyDigest: policy.digest,
        reviewedBaselineRevisionIds: admission.reviewedBaselines.map(({ revisionId }) => revisionId).toSorted(),
        reviewedBaselineDigests: admission.reviewedBaselines.map(({ baselineDigest }) => baselineDigest).toSorted(),
        reviewedObservedSchemaDigests: admission.reviewedBaselines
            .map(({ observedSchemaDigest }) => observedSchemaDigest)
            .toSorted(),
        dependencyDigests: [...new Set(admission.dependencies.map(({ packageDigest }) => packageDigest))].toSorted(),
        activeContractDigests: admission.activeContracts.map(({ contractDigest }) => contractDigest).toSorted(),
        suiteContentDigests: admission.suites.map(({ contentDigest }) => contentDigest).toSorted(),
        catalogRevisionDigest: admission.catalogRevision.digest,
        compatibilityRevisionDigest: admission.compatibilityRevision.digest,
        compatibilityEvaluatorInputDigest: admission.compatibilityRevision.evaluatorInputDigest,
        ...(admission.behavioralRlsPlan ? { behavioralRlsPlanDigest: admission.behavioralRlsPlan.digest } : {}),
        ...(admission.releaseVerificationPlan
            ? {
                  releaseVerificationPlanDigest: admission.releaseVerificationPlan.digest,
                  upgradeBaselineDigests: admission.releaseVerificationPlan.plan.baselines
                      .map(({ packageDigest }) => packageDigest)
                      .toSorted(),
              }
            : {}),
    });
    expect(trace.result.verification.environment.digest).toBe(
        await sha256Hex(canonicalJsonBytes(trace.result.verification.environment.versions)),
    );
    expect(trace.result.verification.environment.versions).toEqual([
        { name: "author-suite-runtime", version: "bun-vm-ipc-v1" },
        { name: "bun", version: Bun.version },
        { name: "platform-policy", version: "postgres-platform-v1.4.0" },
        {
            name: "postgres-image",
            version: "postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
        },
    ]);
    expect(trace.result.verification.bindings.dependencyDigests).toEqual([basicBlocsDigest]);
    for (const suite of admission.suites) {
        const result = trace.result.verification.results.find(({ suiteId }) => suiteId === suite.suiteId);
        expect(result?.outcome).toBe(suite.applicable === false ? "not-applicable" : "passed");
    }
    assertDependencyMatrix(trace.result.verification.results);
    expect(trace.submitted.status).toBe("published");
    expect(suiteOutcome(trace, "platform-package-materialization")).toBe("passed");
    expect(suiteOutcome(trace, "platform-postgres-rls-behavior")).toBe("passed");
    await assertMigrationResult(trace);
}

function assertDependencyMatrix(results: Acceptance["trace"]["result"]["verification"]["results"]): void {
    const matrix = results.find(({ suiteId }) => suiteId === "platform-dependency-matrix");
    expect(matrix?.outcome).toBe("passed");
    expect(matrix?.platformEvidence?.checks).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ checkId: "exact-resolution-points", outcome: "passed" }),
            expect.objectContaining({ checkId: "minimum-package-execution", outcome: "passed", subjectCount: 1 }),
            expect.objectContaining({ checkId: "stable-package-execution", outcome: "passed", subjectCount: 1 }),
        ]),
    );
}

async function assertMigrationResult(trace: Required<Acceptance["trace"]>): Promise<void> {
    expect(trace.result.migrations).toHaveLength(trace.claimed.workload.migrationInputs.length);
    const input = await identifyMigrationVerificationInput(trace.claimed.workload.migrationInputs[0]);
    const result = trace.result.migrations.find(({ migrationInputDigest }) => migrationInputDigest === input.digest);
    expect(result).toMatchObject({
        jobId: trace.claimed.candidate.lease.jobId,
        attemptId: trace.claimed.candidate.lease.attemptId,
        fencingToken: trace.claimed.candidate.lease.fencingToken,
        migrationInputDigest: input.digest,
        runnerDigest: input.input.runner.digest,
        environmentDigest: input.input.environment.digest,
    });
    expect(input.input).toMatchObject({
        source: trace.claimed.workload.migrationInputs[0]?.source,
        target: trace.claimed.workload.migrationInputs[0]?.target,
    });
    expect(result?.observations).toMatchObject({
        freshTarget: { status: "passed" },
        migratedTarget: { status: "passed" },
        equivalence: { status: "passed", equivalent: true },
        ledger: { status: "passed" },
        replay: { status: "passed", unchanged: true },
    });
}

function suiteOutcome(trace: Required<Acceptance["trace"]>, suiteId: string) {
    return trace.result.verification.results.find((result) => result.suiteId === suiteId)?.outcome;
}
