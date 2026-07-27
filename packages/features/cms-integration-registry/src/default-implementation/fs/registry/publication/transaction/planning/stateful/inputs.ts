import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    identifyMigrationVerificationEnvironment,
    identifyMigrationVerificationInput,
    type AdmissionDependencyReferenceV1,
    type MigrationVerificationEnvironmentV1,
    type MigrationVerificationInputV1,
    type ReleaseAdmissionPolicySnapshotV1,
    type StatefulChangeSelectionV1,
} from "@bernouy/cms-integration-verification";
import { integrationVersionSatisfies, type IntegrationDefinition } from "@bernouy/cms-integrations";
import type { IntegrationRegistryCatalogSnapshot } from "cms-integration-registry/interfaces/catalog";
import { FsIntegrationRegistryCandidateAdmissionPlanningError } from "../types";

export async function buildMigrationVerificationInputs(input: {
    snapshot: IntegrationRegistryCatalogSnapshot;
    targetDefinition: IntegrationDefinition;
    dependencies: readonly AdmissionDependencyReferenceV1[];
    selection: StatefulChangeSelectionV1;
    selectionDigest: string;
    policy: ReleaseAdmissionPolicySnapshotV1;
    policyDigest: string;
    environment?: MigrationVerificationEnvironmentV1;
}): Promise<readonly MigrationVerificationInputV1[]> {
    if (input.selection.requiredMigrations.length === 0) {
        return Object.freeze([]);
    }
    if (!input.environment) {
        migrationInputUnavailable("Migration verification environment is unavailable");
    }
    const environment = await identifyMigrationVerificationEnvironment(input.environment);
    const runner = input.policy.approvedRunners.find(
        (entry) =>
            entry.name === environment.environment.runner.identity.name &&
            entry.version === environment.environment.runner.identity.version &&
            entry.imageDigest === environment.environment.runner.identity.imageDigest,
    );
    if (!runner) {
        migrationInputUnavailable("Migration environment runner is not approved by the admission policy");
    }
    const runnerDigest = await sha256Hex(canonicalJsonBytes(runner));
    const dependencies = (selection: "minimum" | "stable") =>
        input.dependencies
            .filter((entry) => entry.selection === selection)
            .map(({ kind, version, packageDigest }) => ({ kind, version, packageDigest }));
    const dependencyMatrices: MigrationVerificationInputV1["dependencyMatrices"] = [
        { selection: "minimum", dependencies: dependencies("minimum") },
        { selection: "stable", dependencies: dependencies("stable") },
    ];
    const identified = await Promise.all(
        input.selection.requiredMigrations.map(async (requirement) => {
            const source = input.snapshot.locateExactVersion(requirement.source.kind, requirement.source.version);
            if (!source || source.package.digest !== requirement.source.packageDigest) {
                migrationInputUnavailable(
                    `Migration source ${requirement.source.kind}@${requirement.source.version} is stale`,
                );
            }
            const targetConnector = findConnector(
                input.targetDefinition,
                requirement.connectorKey,
                requirement.lineageId,
            );
            if (!targetConnector?.migration || targetConnector.migrationRevision === undefined) {
                migrationInputUnavailable(
                    `Target connector ${requirement.connectorKey}/${requirement.lineageId} has no migration plan`,
                );
            }
            const plan = targetConnector.migration;
            const planDigest = await sha256Hex(canonicalJsonBytes(plan));
            const sourceConnector = findConnector(
                source.definitionSnapshot,
                requirement.connectorKey,
                requirement.lineageId,
            );
            const sourceRevision =
                sourceConnector?.migrationRevision ??
                exactlyOneSourceRevision(plan, requirement.source.version, requirement.connectorKey);
            return await identifyMigrationVerificationInput({
                schema: "cms.integration.migration-verification-input.v1",
                source: requirement.source,
                target: input.selection.target,
                dependencyMatrices,
                connectorKey: requirement.connectorKey,
                lineageId: requirement.lineageId,
                sourceMigrationRevision: sourceRevision,
                targetMigrationRevision: targetConnector.migrationRevision,
                statefulChanges: { digest: input.selectionDigest, selection: input.selection },
                migrationPlan: { digest: planDigest, plan },
                policy: { digest: input.policyDigest, snapshot: input.policy },
                runner: { digest: runnerDigest, identity: runner },
                environment: { digest: environment.digest, manifest: environment.environment },
            });
        }),
    );
    return Object.freeze(
        identified.toSorted((left, right) => left.digest.localeCompare(right.digest)).map((entry) => entry.input),
    );
}

function findConnector(definition: IntegrationDefinition, connectorKey: string, lineageId: string) {
    return (definition.connectors ?? []).find(
        (connector) => connector.connectorKey === connectorKey && connector.lineageId === lineageId,
    );
}

function exactlyOneSourceRevision(
    plan: NonNullable<ReturnType<typeof findConnector>>["migration"] & {},
    sourceVersion: string,
    connectorKey: string,
): number {
    const matches = plan.supportedSources.filter((source) => integrationVersionSatisfies(sourceVersion, source.range));
    if (matches.length !== 1) {
        migrationInputUnavailable(`Migration plan for ${connectorKey} does not select source ${sourceVersion} once`);
    }
    return matches[0]!.migrationRevision;
}

function migrationInputUnavailable(message: string): never {
    throw new FsIntegrationRegistryCandidateAdmissionPlanningError("migration_input_unavailable", message);
}
