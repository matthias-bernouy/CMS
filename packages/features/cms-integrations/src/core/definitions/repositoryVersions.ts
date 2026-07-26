import type {
    IntegrationDefinitionIndex,
    IntegrationDefinitionVersion,
} from "../../interfaces/IntegrationDefinitionRepository";
import { IntegrationInputError } from "../errors";
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
        return exact && isIntegrationDefinitionVersionInstallable(exact) ? exact : null;
    }
    const target =
        defaultChannel === "latest"
            ? (index.latest ?? index.stable)
            : (index.stable ?? (index.latest && !isIntegrationPrerelease(index.latest) ? index.latest : undefined));
    if (target) {
        const channel = resolveExactIntegrationDefinitionVersion(index, target);
        if (channel && isIntegrationDefinitionVersionInstallable(channel)) {
            return channel;
        }
    }
    return defaultChannel === "stable"
        ? (index.versions.find(
              (entry) => !isIntegrationPrerelease(entry.version) && isIntegrationDefinitionVersionInstallable(entry),
          ) ?? null)
        : (index.versions.find(isIntegrationDefinitionVersionInstallable) ?? null);
}

export function isIntegrationDefinitionVersionBlocked(version: IntegrationDefinitionVersion): boolean {
    return version.status === "blocked";
}

export function isIntegrationDefinitionVersionInstallable(version: IntegrationDefinitionVersion): boolean {
    return version.status === undefined;
}

export function assertIntegrationVersionInstallable(
    index: IntegrationDefinitionIndex,
    version: string,
): IntegrationDefinitionVersion {
    const entry = resolveExactIntegrationDefinitionVersion(index, version);
    if (!entry) {
        throw new IntegrationInputError("version", `unknown integration version "${index.kind}@${version}"`);
    }
    if (!isIntegrationDefinitionVersionInstallable(entry)) {
        throw new IntegrationInputError(
            "version",
            `integration version "${index.kind}@${version}" is ${entry.status} and cannot be installed or upgraded`,
        );
    }
    return entry;
}

export function assertUpgradeEligible(
    index: IntegrationDefinitionIndex,
    version: string,
): IntegrationDefinitionVersion {
    return assertIntegrationVersionInstallable(index, version);
}
