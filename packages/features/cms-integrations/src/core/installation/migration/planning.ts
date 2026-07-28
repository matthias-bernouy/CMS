import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { integrationVersionSatisfies } from "../../definitions/versioning";
import { IntegrationInputError, IntegrationRuntimeError } from "../../errors";
import type { IntegrationDefinition } from "../../../interfaces/Integration";
import type { IntegrationInstallation } from "../../../interfaces/IntegrationInstallation";
import type {
    IntegrationMigrationConnectorTransition,
    IntegrationMigrationPhase,
} from "../../../interfaces/IntegrationConnectorDeployer";

export const PRE_ACTIVATION_PHASES: IntegrationMigrationPhase[] = [
    "expand",
    "deploy-functions",
    "smoke-target",
    "provider-direct-transition",
    "switch-cms-binding",
    "smoke-cms",
];

export const POST_ACTIVATION_PHASES: IntegrationMigrationPhase[] = [
    "drain",
    "point-of-no-return",
    "contract",
    "reconcile-declarative",
];

export function planConnectorTransitions(
    installation: IntegrationInstallation,
    target: IntegrationDefinition,
    targetPackageDigest: string,
): IntegrationMigrationConnectorTransition[] {
    const persistedOperation = installation.migrationOperation;
    if (persistedOperation && persistedOperation.status !== "completed" && persistedOperation.status !== "aborted") {
        assertPersistedTransitionsMatchTarget(persistedOperation.connectors, target);
        return structuredClone(persistedOperation.connectors);
    }
    const sourceVersion = installation.definitionVersion;
    return (target.connectors ?? [])
        .filter((connector) => connector.migration !== undefined)
        .map((connector) => {
            if (
                !connector.connectorKey ||
                !connector.lineageId ||
                connector.migrationRevision === undefined ||
                !connector.migration
            ) {
                throw new IntegrationRuntimeError("Parsed migration-aware connector is missing its identity");
            }
            const source = connector.migration.supportedSources.find((candidate) =>
                integrationVersionSatisfies(sourceVersion, candidate.range),
            );
            if (!source) {
                throw new IntegrationInputError(
                    "version",
                    `connector "${connector.connectorKey}" does not support migration from ${sourceVersion}`,
                );
            }
            const existing = installation.connectorBindings?.[connector.connectorKey];
            if (!existing) {
                throw new IntegrationInputError(
                    "version",
                    `connector "${connector.connectorKey}" requires explicit legacy baseline adoption before migration`,
                );
            }
            assertMigrationBindingProvenance(
                installation,
                target,
                targetPackageDigest,
                connector.connectorKey,
                connector.provider,
                connector.lineageId,
                source.migrationRevision,
                existing,
            );
            if (existing.provider !== connector.provider || existing.lineageId !== connector.lineageId) {
                throw new IntegrationInputError(
                    "version",
                    `connector "${connector.connectorKey}" cannot implicitly change provider or lineage`,
                );
            }
            const fromRevision = existing.migrationRevision;
            if (fromRevision !== source.migrationRevision) {
                throw new IntegrationInputError(
                    "version",
                    `connector "${connector.connectorKey}" source revision does not match its supported source declaration`,
                );
            }
            if (fromRevision > connector.migrationRevision) {
                throw new IntegrationInputError(
                    "version",
                    `connector "${connector.connectorKey}" cannot migrate backwards`,
                );
            }
            assertMigrationContinuity(
                connector.connectorKey,
                fromRevision,
                connector.migrationRevision,
                connector.migration.migrations,
            );
            return {
                connectorKey: connector.connectorKey,
                provider: connector.provider,
                lineageId: connector.lineageId,
                connectorInstanceId: existing.connectorInstanceId,
                fromRevision,
                toRevision: connector.migrationRevision,
                plan: connector.migration,
            };
        });
}

function assertMigrationBindingProvenance(
    installation: IntegrationInstallation,
    target: IntegrationDefinition,
    targetPackageDigest: string,
    connectorKey: string,
    provider: string,
    lineageId: string,
    sourceRevision: number,
    binding: NonNullable<IntegrationInstallation["connectorBindings"]>[string],
): void {
    const sourceConnector = installation.definitionSnapshot?.connectors?.find(
        (connector) => connector.connectorKey === connectorKey,
    );
    if (
        sourceConnector?.migration &&
        sourceConnector.provider === provider &&
        sourceConnector.lineageId === lineageId &&
        sourceConnector.migrationRevision === binding.migrationRevision
    ) {
        return;
    }
    const adoption = installation.connectorBaselineAdoptions?.find(
        (audit) =>
            audit.sourceDefinitionVersion === installation.definitionVersion &&
            audit.sourcePackageDigest === installation.packageDigest &&
            audit.targetDefinitionVersion === target.version &&
            audit.targetPackageDigest === targetPackageDigest &&
            audit.connectorKey === connectorKey &&
            audit.provider === provider &&
            audit.lineageId === lineageId &&
            audit.connectorInstanceId === binding.connectorInstanceId &&
            audit.migrationRevision === sourceRevision,
    );
    if (!adoption) {
        throw new IntegrationInputError(
            "version",
            `connector "${connectorKey}" has no explicit legacy adoption audit for this target package`,
        );
    }
}

function assertPersistedTransitionsMatchTarget(
    transitions: IntegrationMigrationConnectorTransition[],
    target: IntegrationDefinition,
): void {
    const targetConnectors = (target.connectors ?? []).filter((connector) => connector.migration);
    if (transitions.length !== targetConnectors.length) {
        throw new IntegrationRuntimeError("persisted migration connectors do not match the target definition");
    }
    for (const transition of transitions) {
        const connector = targetConnectors.find((candidate) => candidate.connectorKey === transition.connectorKey);
        if (
            !connector ||
            connector.provider !== transition.provider ||
            connector.lineageId !== transition.lineageId ||
            connector.migrationRevision !== transition.toRevision ||
            JSON.stringify(connector.migration) !== JSON.stringify(transition.plan)
        ) {
            throw new IntegrationRuntimeError(
                `persisted migration connector "${transition.connectorKey}" does not match the target definition`,
            );
        }
    }
}

export async function migrationStepIdentity(input: {
    operationId: string;
    phase: IntegrationMigrationPhase;
    targetPackageDigest: string;
    connectors: IntegrationMigrationConnectorTransition[];
}): Promise<{ id: string; targetDigest: string; idempotencyKey: string }> {
    const targetDigest = await sha256Hex(
        canonicalJsonBytes({
            schema: "cms.integration.migration-step.v1",
            phase: input.phase,
            targetPackageDigest: input.targetPackageDigest,
            connectors: input.connectors.map((connector) => ({
                connectorKey: connector.connectorKey,
                lineageId: connector.lineageId,
                connectorInstanceId: connector.connectorInstanceId,
                fromRevision: connector.fromRevision,
                toRevision: connector.toRevision,
                cutover: {
                    cmsMediated: connector.plan.cmsMediated ?? null,
                    providerDirect: connector.plan.providerDirect ?? null,
                },
            })),
        }),
    );
    return {
        id: input.phase,
        targetDigest,
        idempotencyKey: await sha256Hex(
            canonicalJsonBytes({ operationId: input.operationId, phase: input.phase, targetDigest }),
        ),
    };
}

function assertMigrationContinuity(
    connectorKey: string,
    fromRevision: number,
    toRevision: number,
    migrations: Array<{ id: string; fromRevision: number; toRevision: number }>,
): void {
    let revision = fromRevision;
    for (const migration of migrations
        .filter((entry) => entry.toRevision > fromRevision && entry.toRevision <= toRevision)
        .sort((left, right) => left.toRevision - right.toRevision)) {
        if (migration.fromRevision !== revision) {
            throw new IntegrationInputError(
                "version",
                `connector "${connectorKey}" migration chain has a gap before "${migration.id}"`,
            );
        }
        revision = migration.toRevision;
    }
    if (revision !== toRevision) {
        throw new IntegrationInputError(
            "version",
            `connector "${connectorKey}" migration chain stops at revision ${revision}, expected ${toRevision}`,
        );
    }
}
