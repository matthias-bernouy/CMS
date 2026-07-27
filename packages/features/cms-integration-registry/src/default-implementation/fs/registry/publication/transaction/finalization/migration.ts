import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { integrationVersionSatisfies } from "@bernouy/cms-integrations";
import {
    evaluateMigrationReportAgainstPolicy,
    identifyMigrationJobResult,
    identifyMigrationReport,
    identifyMigrationVerificationInput,
    type CandidateAdmissionJobResultV1,
    type CompatibilityReportV2,
    type MigrationCheckResult,
    type MigrationJobResultV1,
    type MigrationOperationalEvidence,
    type MigrationRawObservationEvidenceV1,
    type MigrationReport,
    type MigrationVerificationInputV1,
    type ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";

export async function buildCandidateMigrationReports(
    input: Readonly<{
        candidateId: string;
        createdAt: string;
        compatibility: CompatibilityReportV2;
        policy: ReleaseAdmissionPolicySnapshotV1;
        migrationInputs: readonly MigrationVerificationInputV1[];
        result: CandidateAdmissionJobResultV1;
    }>,
): Promise<readonly MigrationReport[]> {
    if (input.migrationInputs.length !== input.result.migrations.length) {
        throw new TypeError("Candidate migration result count does not match its exact plan");
    }
    return await Promise.all(
        input.migrationInputs.map(async (migrationInput, index) => {
            const migrationResult = input.result.migrations[index];
            if (!migrationResult) {
                throw new TypeError("Candidate migration result is missing");
            }
            return await buildMigrationReport(input, migrationInput, migrationResult);
        }),
    );
}

async function buildMigrationReport(
    context: Parameters<typeof buildCandidateMigrationReports>[0],
    inputValue: MigrationVerificationInputV1,
    resultValue: MigrationJobResultV1,
): Promise<MigrationReport> {
    const input = await identifyMigrationVerificationInput(inputValue);
    const result = await identifyMigrationJobResult(resultValue);
    if (result.result.migrationInputDigest !== input.digest) {
        throw new TypeError("Candidate migration result substituted its exact input digest");
    }
    const checks = {
        freshInstall: await observationCheck(result.result.observations.freshTarget),
        migratedState: await observationCheck(result.result.observations.migratedTarget),
        equivalence: await observationCheck(result.result.observations.equivalence),
        failureInjection: await aggregateChecks(result.result.observations.failureInjections),
        resumption: await aggregateChecks(result.result.observations.resumptions),
    };
    const activationEvidenceDigest = await observationDigest(result.result.observations.cutover.activation);
    const operationalEvidence = migrationOperationalEvidence(input.input, result.result, activationEvidenceDigest);
    const legacy = await identifyMigrationReport({
        schema: "cms.integration.migration-report.v1",
        reportId: `migration-${input.digest.slice(0, 40)}`,
        revisionType: "root",
        origin: "admission",
        createdAt: context.createdAt,
        source: input.input.source,
        target: input.input.target,
        connectorKey: input.input.connectorKey,
        lineageId: input.input.lineageId,
        migrationRevision: input.input.targetMigrationRevision,
        supportedSourceRange: selectedSourceRange(input.input),
        runner: input.input.runner.identity,
        policy: input.input.policy.snapshot.migrationPolicy,
        policySnapshotDigest: input.input.policy.digest,
        migrationInputDigest: input.digest,
        migrationJobResultDigest: result.digest,
        statefulChangeSelectionDigest: input.input.statefulChanges.digest,
        environmentDigest: input.input.environment.digest,
        checks,
        cutover: {
            cmsMediated: cmsCutover(result.result),
            providerDirect: providerCutover(result.result),
        },
        rollback: "unavailable",
        pointOfNoReturn: input.input.migrationPlan.plan.pointOfNoReturn,
        delayedCleanupVerified: result.result.observations.cutover.activation.cleanupObserved === true,
        outcome: executionOutcome(checks),
        provenance: {
            actor: "repository-verifier",
            reason: "candidate-migration-admission",
            evidenceIds: [context.candidateId, result.result.jobId, result.result.attemptId],
        },
    });
    const policyEvaluation = evaluateMigrationReportAgainstPolicy(
        legacy.report,
        context.policy.migrationEvidence,
        context.compatibility.releaseLevel,
    );
    return (
        await identifyMigrationReport({
            ...legacy.report,
            schema: "cms.integration.migration-report.v3",
            policyEvaluation,
            operationalEvidence,
        })
    ).report;
}

function migrationOperationalEvidence(
    input: MigrationVerificationInputV1,
    result: MigrationJobResultV1,
    activationEvidenceDigest: string | undefined,
): MigrationOperationalEvidence {
    const activation = result.observations.cutover.activation;
    const cleanupDelaySeconds = maximumDefined(
        input.migrationPlan.plan.cmsMediated?.drainSeconds,
        input.migrationPlan.plan.providerDirect?.drainSeconds,
    );
    const pointObservation =
        activation.pointOfNoReturnCrossed === undefined
            ? "not-observed"
            : activation.pointOfNoReturnCrossed
              ? "crossed"
              : "not-crossed";
    const cleanupObserved = activation.cleanupObserved === true;
    return {
        downtime: { status: "not-measured" },
        drain: {
            ...(input.migrationPlan.plan.cmsMediated?.drainSeconds === undefined
                ? {}
                : { cmsMediatedSeconds: input.migrationPlan.plan.cmsMediated.drainSeconds }),
            ...(input.migrationPlan.plan.providerDirect?.drainSeconds === undefined
                ? {}
                : { providerDirectSeconds: input.migrationPlan.plan.providerDirect.drainSeconds }),
        },
        rollback: { capability: "unavailable", verified: false },
        pointOfNoReturn: {
            phase: input.migrationPlan.plan.pointOfNoReturn,
            observation: pointObservation,
            ...(pointObservation === "not-observed" ? {} : { evidenceDigest: activationEvidenceDigest! }),
        },
        cleanup: {
            ...(cleanupDelaySeconds === undefined ? {} : { delaySeconds: cleanupDelaySeconds }),
            observed: cleanupObserved,
            ...(cleanupObserved ? { evidenceDigest: activationEvidenceDigest! } : {}),
        },
    };
}

function maximumDefined(...values: readonly (number | undefined)[]): number | undefined {
    const defined = values.filter((value): value is number => value !== undefined);
    return defined.length === 0 ? undefined : Math.max(...defined);
}

async function observationDigest(value: MigrationRawObservationEvidenceV1): Promise<string | undefined> {
    return value.status === "passed" || value.status === "failed"
        ? await sha256Hex(canonicalJsonBytes(value))
        : undefined;
}

async function observationCheck(value: MigrationRawObservationEvidenceV1): Promise<MigrationCheckResult> {
    return {
        outcome: value.status,
        ...(value.status === "passed" || value.status === "failed"
            ? { evidenceDigest: await sha256Hex(canonicalJsonBytes(value)) }
            : {}),
    };
}

async function aggregateChecks(values: readonly MigrationRawObservationEvidenceV1[]): Promise<MigrationCheckResult> {
    if (values.length === 0) {
        return { outcome: "not-applicable" };
    }
    const outcome = [...values].map((entry) => entry.status).toSorted(statusOrder)[0]!;
    return {
        outcome,
        ...(outcome === "passed" || outcome === "failed"
            ? { evidenceDigest: await sha256Hex(canonicalJsonBytes(values)) }
            : {}),
    };
}

function statusOrder(left: MigrationCheckResult["outcome"], right: MigrationCheckResult["outcome"]): number {
    const rank = { "infrastructure-failure": 0, failed: 1, "not-supported": 2, passed: 3, "not-applicable": 4 };
    return rank[left] - rank[right];
}

function executionOutcome(checks: Readonly<Record<string, MigrationCheckResult>>): MigrationReport["outcome"] {
    const values = Object.values(checks);
    return values.some((check) => check.outcome === "infrastructure-failure")
        ? "infrastructure-failure"
        : checks.freshInstall?.outcome !== "passed" ||
            checks.migratedState?.outcome !== "passed" ||
            checks.equivalence?.outcome !== "passed" ||
            values.some((check) => check.outcome === "failed")
          ? "failed"
          : "passed";
}

function selectedSourceRange(input: MigrationVerificationInputV1): string {
    const source = input.migrationPlan.plan.supportedSources.find(
        (entry) =>
            entry.migrationRevision === input.sourceMigrationRevision &&
            integrationVersionSatisfies(input.source.version, entry.range),
    );
    if (!source) {
        throw new TypeError("Candidate migration input has no exact selected source range");
    }
    return source.range;
}

function cmsCutover(result: MigrationJobResultV1): MigrationReport["cutover"]["cmsMediated"] {
    const strategy = result.observations.cutover.cmsMediated.strategy;
    return strategy === "binding-switch" ? "binding-revision" : "not-applicable";
}

function providerCutover(result: MigrationJobResultV1): MigrationReport["cutover"]["providerDirect"] {
    const strategy = result.observations.cutover.providerDirect.strategy;
    return strategy === "journalled-provider-switch"
        ? "provider-cutover"
        : strategy === "expand-in-code"
          ? "expand-in-code"
          : "not-applicable";
}
