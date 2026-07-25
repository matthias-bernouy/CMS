import type { IntegrationDefinitionIndex, IntegrationDefinitionVersion } from "@bernouy/cms-integrations";
import { isIntegrationPrerelease } from "@bernouy/cms-integrations";

export function resolveSnapshotVersion(
    index: IntegrationDefinitionIndex,
    requestedVersion: string | undefined,
    defaultChannel: "stable" | "latest",
): IntegrationDefinitionVersion | null {
    if (requestedVersion) {
        return index.versions.find((version) => version.version === requestedVersion) ?? null;
    }
    const target =
        defaultChannel === "latest"
            ? (index.latest ?? index.stable)
            : (index.stable ?? (index.latest && !isIntegrationPrerelease(index.latest) ? index.latest : undefined));
    if (target) {
        return index.versions.find((version) => version.version === target) ?? null;
    }
    return defaultChannel === "stable"
        ? (index.versions.find((version) => !isIntegrationPrerelease(version.version)) ?? null)
        : (index.versions[0] ?? null);
}
