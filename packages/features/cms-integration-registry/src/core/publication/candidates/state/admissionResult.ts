import type {
    CandidateAdmissionJobResultV1,
    MigrationJobResultV1,
    ReleaseAdmissionPolicySnapshotV1,
    VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";

export type CandidateAdmissionJobOutcome = "passed" | "rejected" | "infrastructure-failure";

export function asCandidateAdmissionJobResult(
    result: CandidateAdmissionJobResultV1 | VerificationJobResultV1,
): CandidateAdmissionJobResultV1 {
    return result.schema === "cms.integration.candidate-admission-job-result.v1"
        ? result
        : {
              schema: "cms.integration.candidate-admission-job-result.v1",
              verification: result,
              migrations: [],
          };
}

export function candidateAdmissionJobOutcome(
    result: CandidateAdmissionJobResultV1,
    policy: ReleaseAdmissionPolicySnapshotV1,
): CandidateAdmissionJobOutcome {
    const verification = result.verification.results.some((entry) => entry.outcome === "infrastructure-failure")
        ? "infrastructure-failure"
        : result.verification.results.every((entry) => entry.outcome === "passed" || entry.outcome === "not-applicable")
          ? "passed"
          : "rejected";
    const migrations = result.migrations.map((migration) => migrationOutcome(migration, policy));
    return verification === "infrastructure-failure" || migrations.includes("infrastructure-failure")
        ? "infrastructure-failure"
        : verification === "rejected" || migrations.includes("rejected")
          ? "rejected"
          : "passed";
}

function migrationOutcome(
    result: MigrationJobResultV1,
    policy: ReleaseAdmissionPolicySnapshotV1,
): CandidateAdmissionJobOutcome {
    const observations = result.observations;
    const evidence = [
        observations.freshTarget,
        observations.migratedTarget,
        observations.equivalence,
        observations.ledger,
        observations.replay,
        ...observations.failureInjections,
        ...observations.resumptions,
        observations.cutover.cmsMediated,
        observations.cutover.providerDirect,
        observations.cutover.activation,
    ];
    if (evidence.some((entry) => entry.status === "infrastructure-failure")) {
        return "infrastructure-failure";
    }
    if (evidence.some((entry) => entry.status === "failed")) {
        return "rejected";
    }
    if (
        observations.freshTarget.status !== "passed" ||
        observations.migratedTarget.status !== "passed" ||
        observations.equivalence.status !== "passed"
    ) {
        return "rejected";
    }
    if (
        requiredListFailed(policy, "failure-injection", observations.failureInjections) ||
        requiredListFailed(policy, "resumption", observations.resumptions)
    ) {
        return "rejected";
    }
    if (
        (policy.migrationEvidence.requireCmsMediatedCutoverEvidence &&
            observations.cutover.cmsMediated.strategy !== "not-applicable" &&
            observations.cutover.cmsMediated.status !== "passed") ||
        (policy.migrationEvidence.requireProviderDirectCutoverEvidence &&
            observations.cutover.providerDirect.strategy !== "not-applicable" &&
            observations.cutover.providerDirect.status !== "passed") ||
        policy.migrationEvidence.requireRollbackEvidence ||
        (policy.migrationEvidence.requireDelayedCleanupEvidence &&
            observations.cutover.activation.cleanupObserved !== true)
    ) {
        return "rejected";
    }
    return "passed";
}

function requiredListFailed(
    policy: ReleaseAdmissionPolicySnapshotV1,
    check: "failure-injection" | "resumption",
    observations: readonly Readonly<{ status: string }>[],
): boolean {
    return (
        policy.migrationEvidence.requiredChecks.includes(check) &&
        (observations.length === 0 || observations.some((entry) => entry.status !== "passed"))
    );
}
