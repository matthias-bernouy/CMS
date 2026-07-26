import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    integrationVersionReleaseLevel,
    isIntegrationPrerelease,
    type IntegrationDefinitionIndex,
    type IntegrationDefinitionVersion,
} from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";

export function nextStableIntegrationRegistryIndex(
    previous: IntegrationDefinitionIndex,
    version: string,
): IntegrationDefinitionIndex {
    if (!previous.versions.some((entry) => entry.version === version)) {
        throw new Error(`Stable promotion target is absent from the integration index: ${previous.kind}@${version}`);
    }
    if (isIntegrationPrerelease(version)) {
        throw new Error(`Stable promotion target must not be a prerelease: ${previous.kind}@${version}`);
    }
    return parseIntegrationDefinitionIndex(
        { ...previous, stable: version },
        `stable-promotion:${previous.kind}@${version}`,
    );
}

export function nextVersionEligibilityIndex(
    previous: IntegrationDefinitionIndex,
    version: string,
    status: "blocked" | "inadmissible",
): IntegrationDefinitionIndex {
    let found = false;
    const versions = previous.versions.map((entry) => {
        if (entry.version !== version) {
            return entry;
        }
        found = true;
        return { ...entry, status };
    });
    if (!found) {
        throw new Error(`Version eligibility target is absent from the integration index: ${previous.kind}@${version}`);
    }
    const installable = versions.filter((entry) => entry.status === undefined);
    const stable = newest(installable.filter((entry) => !isIntegrationPrerelease(entry.version)))?.version;
    const latest = newest(installable)?.version;
    return parseIntegrationDefinitionIndex(
        {
            ...previous,
            versions,
            ...(stable ? { stable } : { stable: undefined }),
            ...(latest ? { latest } : { latest: undefined }),
        },
        `version-eligibility:${previous.kind}@${version}`,
    );
}

export function sameIntegrationRegistryIndex(
    left: IntegrationDefinitionIndex | null,
    right: IntegrationDefinitionIndex | null,
): boolean {
    if (left === null || right === null) {
        return left === right;
    }
    const leftBytes = canonicalJsonBytes(left);
    const rightBytes = canonicalJsonBytes(right);
    return (
        leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index])
    );
}

function newest(versions: readonly IntegrationDefinitionVersion[]): IntegrationDefinitionVersion | undefined {
    return versions.reduce<IntegrationDefinitionVersion | undefined>((current, candidate) => {
        if (!current || integrationVersionReleaseLevel(current.version, candidate.version)) {
            return candidate;
        }
        return current;
    }, undefined);
}
