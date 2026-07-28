import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { isExactIntegrationVersion } from "../../../definitions/versioning";
import { IntegrationInputError, IntegrationRuntimeError } from "../../../errors";
import type { IntegrationInstallation } from "../../../../interfaces/IntegrationInstallation";
import type { ResolvedIntegrationPackageRoot } from "../../../../interfaces/IntegrationConnectorDeployer";

export function legacyBaselineAdoptionConfirmation(input: {
    integrationId: string;
    sourceVersion: string;
    sourcePackageDigest: string;
    targetVersion: string;
    targetPackageDigest: string;
    connectorKey: string;
}): string {
    return [
        "adopt-legacy-baseline",
        `${input.integrationId}@${input.sourceVersion}`,
        input.sourcePackageDigest,
        `via-${input.targetVersion}`,
        input.targetPackageDigest,
        input.connectorKey,
    ].join(":");
}

export function requiredSourceDigest(installation: IntegrationInstallation): string {
    if (!isExactIntegrationVersion(installation.definitionVersion) || !installation.packageDigest) {
        throw new IntegrationInputError(
            "integrationId",
            "legacy baseline adoption requires exact installed provenance",
        );
    }
    return installation.packageDigest;
}

export function requiredTargetVersion(target: ResolvedIntegrationPackageRoot): string {
    const version = target.definition.version;
    if (
        !version ||
        version !== target.version ||
        target.kind !== target.definition.kind ||
        !isExactIntegrationVersion(version) ||
        !/^[a-f0-9]{64}$/.test(target.digest)
    ) {
        throw new IntegrationRuntimeError("resolved adoption target does not have exact matching provenance", 502);
    }
    return version;
}

export function requiredTargetConnector(target: ResolvedIntegrationPackageRoot, connectorKey: string) {
    const connector = target.definition.connectors?.find((candidate) => candidate.connectorKey === connectorKey);
    if (!connector?.migration || !connector.lineageId || connector.migrationRevision === undefined) {
        throw new IntegrationInputError("connectorKey", `target connector "${connectorKey}" is not migration-aware`);
    }
    return connector;
}

export function assertAdoptionState(installation: IntegrationInstallation, connectorKey: string): void {
    if (installation.status !== "success" || installation.migrationOperation) {
        throw new IntegrationRuntimeError("legacy baseline adoption requires an idle successful installation", 409);
    }
    if (installation.connectorBindings?.[connectorKey]) {
        throw new IntegrationRuntimeError(`connector "${connectorKey}" already has a persisted identity`, 409);
    }
}

export async function deterministicConnectorInstanceId(
    integrationId: string,
    connectorKey: string,
    lineageId: string,
    sourceDigest: string,
): Promise<string> {
    return `cms-${await sha256Hex(
        canonicalJsonBytes({
            schema: "cms.integration.connector-instance.v1",
            integrationId,
            connectorKey,
            lineageId,
            sourceDigest,
        }),
    )}`;
}
