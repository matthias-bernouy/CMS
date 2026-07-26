import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { isIntegrationPrerelease, type IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import { projectIntegrationRegistryVersionEligibility } from "../../../../../core/promotion/eligibilityProjection";

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
    const projection = projectIntegrationRegistryVersionEligibility(previous, version, status);
    const { stable, latest } = projection.channels.next;
    return parseIntegrationDefinitionIndex(
        {
            ...previous,
            versions: projection.versions,
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
