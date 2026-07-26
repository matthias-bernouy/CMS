import { isExactIntegrationVersion } from "../../../definitions/versioning";
import { IntegrationRuntimeError } from "../../../errors";
import type { IntegrationInstallation } from "../../../../interfaces/IntegrationInstallation";

const DIGEST = /^[a-f0-9]{64}$/;

export function assertConnectorAdoptionProvenance(
    installation: Pick<IntegrationInstallation, "connectorBindings" | "connectorBaselineAdoptions">,
): void {
    for (const [key, binding] of Object.entries(installation.connectorBindings ?? {})) {
        if (
            binding.connectorKey !== key ||
            !binding.provider.trim() ||
            !binding.lineageId.trim() ||
            !binding.connectorInstanceId.trim() ||
            !Number.isSafeInteger(binding.migrationRevision) ||
            binding.migrationRevision < 0 ||
            Object.values(binding.outputs).some((value) => typeof value !== "string")
        ) {
            invalid();
        }
    }

    const auditIds = new Set<string>();
    for (const audit of installation.connectorBaselineAdoptions ?? []) {
        const binding = installation.connectorBindings?.[audit.connectorKey];
        if (
            auditIds.has(audit.id) ||
            !DIGEST.test(audit.id) ||
            !audit.actor.trim() ||
            !(audit.adoptedAt instanceof Date) ||
            !Number.isFinite(audit.adoptedAt.getTime()) ||
            !isExactIntegrationVersion(audit.sourceDefinitionVersion) ||
            !DIGEST.test(audit.sourcePackageDigest) ||
            !isExactIntegrationVersion(audit.targetDefinitionVersion) ||
            !DIGEST.test(audit.targetPackageDigest) ||
            !DIGEST.test(audit.baselineDigest) ||
            !audit.externalOperationId.trim() ||
            !Number.isSafeInteger(audit.migrationRevision) ||
            audit.migrationRevision < 0 ||
            !binding ||
            binding.provider !== audit.provider ||
            binding.lineageId !== audit.lineageId ||
            binding.connectorInstanceId !== audit.connectorInstanceId
        ) {
            invalid();
        }
        auditIds.add(audit.id);
    }
}

function invalid(): never {
    throw new IntegrationRuntimeError("integration connector adoption provenance is invalid");
}
