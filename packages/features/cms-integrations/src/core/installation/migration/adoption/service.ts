import { randomUUID } from "node:crypto";
import { identifyObservedSchemaContract } from "../../../parsing/templates/connector-compatibility";
import { integrationVersionSatisfies } from "../../../definitions/versioning";
import { IntegrationInputError, IntegrationRuntimeError } from "../../../errors";
import type {
    IntegrationConnectorBaselineAdopter,
    ResolvedIntegrationPackageRoot,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import type { IntegrationInstallation } from "../../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../../interfaces/IntegrationInstallationRepository";
import { buildBaselineAdoptionAudit, recoverAdoptionCommit } from "./audit";
import {
    assertAdoptionState,
    deterministicConnectorInstanceId,
    legacyBaselineAdoptionConfirmation,
    requiredSourceDigest,
    requiredTargetConnector,
    requiredTargetVersion,
} from "./contract";

export { legacyBaselineAdoptionConfirmation } from "./contract";

export type AdoptLegacyConnectorBaselineRequest = {
    installations: IntegrationInstallationRepository;
    installation: IntegrationInstallation;
    targetPackage: ResolvedIntegrationPackageRoot;
    connectorKey: string;
    actor: string;
    confirmation: string;
    adopters: IntegrationConnectorBaselineAdopter[];
    clock?: { now(): Date };
};

export async function adoptLegacyConnectorBaseline(request: AdoptLegacyConnectorBaselineRequest) {
    if (!request.installations.compareAndSwapMigration) {
        throw new IntegrationRuntimeError("legacy baseline adoption requires compare-and-swap persistence", 503);
    }
    if (!request.actor.trim()) {
        throw new IntegrationInputError("actor", "an authenticated administrator identity is required");
    }
    const sourceDigest = requiredSourceDigest(request.installation);
    const targetVersion = requiredTargetVersion(request.targetPackage);
    if (request.targetPackage.kind !== request.installation.id) {
        throw new IntegrationRuntimeError("resolved adoption target does not match the installed integration", 502);
    }
    const connector = requiredTargetConnector(request.targetPackage, request.connectorKey);
    const baseline = connector
        .migration!.supportedSources.filter((source) =>
            integrationVersionSatisfies(request.installation.definitionVersion, source.range),
        )
        .find(
            (source) =>
                source.legacyAdoption?.definitionVersion === request.installation.definitionVersion &&
                source.legacyAdoption.packageDigest === sourceDigest,
        );
    if (!baseline?.legacyAdoption) {
        throw new IntegrationInputError(
            "connectorKey",
            `target does not declare an exact legacy baseline for ${request.installation.definitionVersion}@${sourceDigest}`,
        );
    }
    assertAdoptionState(request.installation, request.connectorKey);
    const expectedConfirmation = legacyBaselineAdoptionConfirmation({
        integrationId: request.installation.id,
        sourceVersion: request.installation.definitionVersion,
        sourcePackageDigest: sourceDigest,
        targetVersion,
        targetPackageDigest: request.targetPackage.digest,
        connectorKey: request.connectorKey,
    });
    if (request.confirmation !== expectedConfirmation) {
        throw new IntegrationInputError("confirmation", `must exactly equal "${expectedConfirmation}"`);
    }
    const adopter = request.adopters.find((candidate) => candidate.provider === connector.provider);
    if (!adopter) {
        throw new IntegrationRuntimeError(`connector baseline adopter "${connector.provider}" is not configured`, 503);
    }
    const connectorInstanceId = await deterministicConnectorInstanceId(
        request.installation.id,
        request.connectorKey,
        connector.lineageId!,
        sourceDigest,
    );
    const expectedBaselineDigest = (await identifyObservedSchemaContract(baseline.legacyAdoption.observedSchema))
        .digest;
    const attemptId = randomUUID();
    const adopted = await adopter.adopt({
        integrationKind: request.installation.id,
        sourceVersion: request.installation.definitionVersion,
        sourcePackageDigest: sourceDigest,
        targetVersion,
        targetPackageDigest: request.targetPackage.digest,
        connectorKey: request.connectorKey,
        provider: connector.provider,
        lineageId: connector.lineageId!,
        connectorInstanceId,
        migrationRevision: baseline.migrationRevision,
        baseline: baseline.legacyAdoption,
        attemptId,
    });
    if (adopted.baselineDigest !== expectedBaselineDigest || !adopted.externalOperationId) {
        throw new IntegrationRuntimeError("connector baseline adopter returned invalid provenance", 502);
    }
    const adoptedAt = (request.clock ?? { now: () => new Date() }).now();
    const updatedAt = nextInstallationRevision(request.installation.updatedAt, adoptedAt);
    const audit = await buildBaselineAdoptionAudit({
        installation: request.installation,
        targetPackage: request.targetPackage,
        connectorKey: request.connectorKey,
        actor: request.actor,
        adoptedAt,
        targetVersion,
        connector,
        connectorInstanceId,
        migrationRevision: baseline.migrationRevision,
        baselineDigest: expectedBaselineDigest,
        externalOperationId: adopted.externalOperationId,
    });
    const next: IntegrationInstallation = {
        ...request.installation,
        updatedAt,
        connectorBindings: {
            ...(request.installation.connectorBindings ?? {}),
            [request.connectorKey]: {
                connectorKey: request.connectorKey,
                provider: connector.provider,
                lineageId: connector.lineageId!,
                connectorInstanceId,
                migrationRevision: baseline.migrationRevision,
                outputs: adopted.outputs,
            },
        },
        connectorBaselineAdoptions: [...(request.installation.connectorBaselineAdoptions ?? []), audit],
    };
    const saved = await request.installations.compareAndSwapMigration(request.installation, next);
    if (!saved) {
        return await recoverAdoptionCommit(request.installations, request.installation.id, audit);
    }
    return { installation: saved, audit };
}

function nextInstallationRevision(current: Date, candidate: Date): Date {
    return new Date(Math.max(candidate.getTime(), current.getTime() + 1));
}
