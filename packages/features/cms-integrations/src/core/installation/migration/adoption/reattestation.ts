import { IntegrationRuntimeError } from "../../../errors";
import type { ResolvedIntegrationPackageRoot } from "../../../../interfaces/IntegrationConnectorDeployer";
import type {
    IntegrationConnectorBaselineAdoptionAudit,
    IntegrationInstallation,
} from "../../../../interfaces/IntegrationInstallation";
import type { IntegrationInstallationRepository } from "../../../../interfaces/IntegrationInstallationRepository";
import { buildBaselineAdoptionAudit, recoverAdoptionCommit } from "./audit";

type ReattestationRequest = {
    installations: IntegrationInstallationRepository;
    installation: IntegrationInstallation;
    targetPackage: ResolvedIntegrationPackageRoot;
    connectorKey: string;
    actor: string;
    adoptedAt: Date;
    connector: NonNullable<ResolvedIntegrationPackageRoot["definition"]["connectors"]>[number];
    connectorInstanceId: string;
    migrationRevision: number;
    baselineDigest: string;
};

export async function reattestLegacyConnectorBaseline(request: ReattestationRequest) {
    const binding = request.installation.connectorBindings?.[request.connectorKey];
    if (!binding) {
        return null;
    }
    if (
        binding.provider !== request.connector.provider ||
        binding.lineageId !== request.connector.lineageId ||
        binding.connectorInstanceId !== request.connectorInstanceId ||
        binding.migrationRevision !== request.migrationRevision
    ) {
        throw new IntegrationRuntimeError(
            `connector "${request.connectorKey}" has incompatible adopted provenance`,
            409,
        );
    }
    const evidence = matchingEvidence(request);
    if (!evidence) {
        throw new IntegrationRuntimeError(`connector "${request.connectorKey}" has no reusable adoption evidence`, 409);
    }
    const audit = await buildBaselineAdoptionAudit({
        ...request,
        targetVersion: request.targetPackage.version,
        externalOperationId: evidence.externalOperationId,
    });
    const existing = request.installation.connectorBaselineAdoptions?.find((candidate) => candidate.id === audit.id);
    if (existing) {
        return { installation: request.installation, audit: existing };
    }
    const next: IntegrationInstallation = {
        ...request.installation,
        updatedAt: new Date(Math.max(request.adoptedAt.getTime(), request.installation.updatedAt.getTime() + 1)),
        connectorBaselineAdoptions: [...(request.installation.connectorBaselineAdoptions ?? []), audit],
    };
    const saved = await request.installations.compareAndSwapMigration!(request.installation, next);
    return saved
        ? { installation: saved, audit }
        : await recoverAdoptionCommit(request.installations, request.installation.id, audit);
}

function matchingEvidence(request: ReattestationRequest): IntegrationConnectorBaselineAdoptionAudit | undefined {
    return request.installation.connectorBaselineAdoptions?.find(
        (audit) =>
            audit.sourceDefinitionVersion === request.installation.definitionVersion &&
            audit.sourcePackageDigest === request.installation.packageDigest &&
            audit.connectorKey === request.connectorKey &&
            audit.provider === request.connector.provider &&
            audit.lineageId === request.connector.lineageId &&
            audit.connectorInstanceId === request.connectorInstanceId &&
            audit.migrationRevision === request.migrationRevision &&
            audit.baselineDigest === request.baselineDigest,
    );
}
