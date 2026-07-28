import {
    resolveExactIntegrationDefinitionVersion,
    resolveInstallableIntegrationDefinitionVersion,
    type IntegrationDefinitionIndex,
    type IntegrationDefinitionVersion,
} from "@bernouy/cms-integrations";

export function resolveSnapshotVersion(
    index: IntegrationDefinitionIndex,
    requestedVersion: string | undefined,
    defaultChannel: "stable" | "latest",
): IntegrationDefinitionVersion | null {
    if (requestedVersion) {
        return resolveExactIntegrationDefinitionVersion(index, requestedVersion);
    }
    return resolveInstallableIntegrationDefinitionVersion(index, undefined, defaultChannel);
}
