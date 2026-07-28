import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { IntegrationRuntimeError } from "../../../errors";
import type { ResolvedIntegrationPackageRoot } from "../../../../interfaces/IntegrationConnectorDeployer";
import type {
    IntegrationConnectorBaselineAdoptionAudit,
    IntegrationInstallation,
} from "../../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../../interfaces/IntegrationInstallationRepository";

export async function buildBaselineAdoptionAudit(input: {
    installation: IntegrationInstallation;
    targetPackage: ResolvedIntegrationPackageRoot;
    connectorKey: string;
    actor: string;
    adoptedAt: Date;
    targetVersion: string;
    connector: NonNullable<ResolvedIntegrationPackageRoot["definition"]["connectors"]>[number];
    connectorInstanceId: string;
    migrationRevision: number;
    baselineDigest: string;
    externalOperationId: string;
}): Promise<IntegrationConnectorBaselineAdoptionAudit> {
    const id = await sha256Hex(
        canonicalJsonBytes({
            schema: "cms.integration.connector-baseline-adoption.v1",
            integrationId: input.installation.id,
            sourcePackageDigest: input.installation.packageDigest,
            targetPackageDigest: input.targetPackage.digest,
            connectorKey: input.connectorKey,
            connectorInstanceId: input.connectorInstanceId,
            baselineDigest: input.baselineDigest,
        }),
    );
    return {
        id,
        actor: input.actor,
        adoptedAt: input.adoptedAt,
        sourceDefinitionVersion: input.installation.definitionVersion,
        sourcePackageDigest: input.installation.packageDigest!,
        targetDefinitionVersion: input.targetVersion,
        targetPackageDigest: input.targetPackage.digest,
        connectorKey: input.connectorKey,
        provider: input.connector.provider,
        lineageId: input.connector.lineageId!,
        connectorInstanceId: input.connectorInstanceId,
        migrationRevision: input.migrationRevision,
        baselineDigest: input.baselineDigest,
        externalOperationId: input.externalOperationId,
    };
}

export async function recoverAdoptionCommit(
    installations: IntegrationInstallationRepository,
    integrationId: string,
    expectedAudit: IntegrationConnectorBaselineAdoptionAudit,
) {
    const current = await installations.get(integrationId);
    const audit = current?.connectorBaselineAdoptions?.find((candidate) => candidate.id === expectedAudit.id);
    const binding = current?.connectorBindings?.[expectedAudit.connectorKey];
    if (
        !current ||
        !audit ||
        !sameAuditProvenance(audit, expectedAudit) ||
        binding?.connectorInstanceId !== expectedAudit.connectorInstanceId ||
        binding.provider !== expectedAudit.provider ||
        binding.lineageId !== expectedAudit.lineageId ||
        binding.migrationRevision !== expectedAudit.migrationRevision
    ) {
        throw new IntegrationRuntimeError("installation changed while committing connector baseline adoption", 409);
    }
    return { installation: current, audit };
}

function sameAuditProvenance(
    actual: IntegrationConnectorBaselineAdoptionAudit,
    expected: IntegrationConnectorBaselineAdoptionAudit,
): boolean {
    const fields: Array<keyof IntegrationConnectorBaselineAdoptionAudit> = [
        "sourceDefinitionVersion",
        "sourcePackageDigest",
        "targetDefinitionVersion",
        "targetPackageDigest",
        "connectorKey",
        "provider",
        "lineageId",
        "connectorInstanceId",
        "migrationRevision",
        "baselineDigest",
        "externalOperationId",
    ];
    return fields.every((field) => actual[field] === expected[field]);
}
