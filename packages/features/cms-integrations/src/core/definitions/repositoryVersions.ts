import type {
    IntegrationDefinitionIndex,
    IntegrationDefinitionVersion,
} from "../../interfaces/IntegrationDefinitionRepository";
import { isIntegrationPrerelease } from "./versioning";

export function resolveExactIntegrationDefinitionVersion(
    index: IntegrationDefinitionIndex,
    version: string,
): IntegrationDefinitionVersion | null {
    return index.versions.find((entry) => entry.version === version) ?? null;
}

export function resolveInstallableIntegrationDefinitionVersion(
    index: IntegrationDefinitionIndex,
    requestedVersion: string | undefined,
    defaultChannel: "stable" | "latest",
): IntegrationDefinitionVersion | null {
    if (requestedVersion) {
        const exact = resolveExactIntegrationDefinitionVersion(index, requestedVersion);
        return exact && !isIntegrationDefinitionVersionBlocked(exact) ? exact : null;
    }
    const target =
        defaultChannel === "latest"
            ? (index.latest ?? index.stable)
            : (index.stable ?? (index.latest && !isIntegrationPrerelease(index.latest) ? index.latest : undefined));
    if (target) {
        const channel = resolveExactIntegrationDefinitionVersion(index, target);
        if (channel && !isIntegrationDefinitionVersionBlocked(channel)) {
            return channel;
        }
    }
    return defaultChannel === "stable"
        ? (index.versions.find(
              (entry) => !isIntegrationPrerelease(entry.version) && !isIntegrationDefinitionVersionBlocked(entry),
          ) ?? null)
        : (index.versions.find((entry) => !isIntegrationDefinitionVersionBlocked(entry)) ?? null);
}

export function isIntegrationDefinitionVersionBlocked(version: IntegrationDefinitionVersion): boolean {
    return version.status === "blocked";
}
