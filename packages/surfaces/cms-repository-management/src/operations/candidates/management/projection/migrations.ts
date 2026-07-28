import { integrationVersionSatisfies } from "@bernouy/cms-integrations";
import type { MigrationJobResultV1, MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";
import {
    projectCutoverObservation,
    projectEquivalenceObservation,
    projectLedgerObservation,
    projectReplayObservation,
    projectTargetObservation,
} from "./migrationObservations";

export async function projectCandidateMigrations(
    inputs: readonly MigrationVerificationInputV1[],
    results: readonly MigrationJobResultV1[],
    inputDigests: readonly string[],
) {
    const resultsByInput = new Map(results.map((result) => [result.migrationInputDigest, result]));
    if (resultsByInput.size !== results.length) {
        throw new TypeError("Candidate migration results contain duplicate input digests");
    }
    if (inputs.length !== inputDigests.length) {
        throw new TypeError("Candidate migration inputs do not match their persisted digests");
    }
    const projected = inputs.map((input, index) => {
        const inputDigest = inputDigests[index]!;
        const result = resultsByInput.get(inputDigest);
        if (result) {
            resultsByInput.delete(inputDigest);
        }
        return projectMigration(input, inputDigest, result);
    });
    if (resultsByInput.size !== 0) {
        throw new TypeError("Candidate migration result substitutes its exact input");
    }
    return projected;
}

function projectMigration(input: MigrationVerificationInputV1, inputDigest: string, result?: MigrationJobResultV1) {
    const supportedSource = input.migrationPlan.plan.supportedSources.find(
        (source) =>
            source.migrationRevision === input.sourceMigrationRevision &&
            integrationVersionSatisfies(input.source.version, source.range),
    );
    if (!supportedSource) {
        throw new TypeError("Candidate migration input has no exact supported source range");
    }
    if (
        result &&
        (result.migrationInputDigest !== inputDigest ||
            result.runnerDigest !== input.runner.digest ||
            result.environmentDigest !== input.environment.digest)
    ) {
        throw new TypeError("Candidate migration result substitutes its exact execution input");
    }
    return {
        migrationInputDigest: inputDigest,
        source: {
            kind: input.source.kind,
            version: input.source.version,
            packageDigest: input.source.packageDigest,
        },
        target: {
            kind: input.target.kind,
            version: input.target.version,
            packageDigest: input.target.packageDigest,
        },
        connectorKey: input.connectorKey,
        lineageId: input.lineageId,
        sourceMigrationRevision: input.sourceMigrationRevision,
        targetMigrationRevision: input.targetMigrationRevision,
        supportedSourceRange: supportedSource.range,
        ...(result
            ? {
                  result: {
                      runnerDigest: result.runnerDigest,
                      environmentDigest: result.environmentDigest,
                      freshTarget: projectTargetObservation(result.observations.freshTarget),
                      migratedTarget: projectTargetObservation(result.observations.migratedTarget),
                      equivalence: projectEquivalenceObservation(result.observations.equivalence),
                      ledger: projectLedgerObservation(result.observations.ledger),
                      replay: projectReplayObservation(result.observations.replay),
                      cutover: projectCutoverObservation(result.observations.cutover),
                  },
              }
            : {}),
    };
}
