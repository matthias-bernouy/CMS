import {
    integrationVersionReleaseLevel,
    isIntegrationPrerelease,
    type IntegrationDefinitionIndex,
    type IntegrationDefinitionVersion,
} from "@bernouy/cms-integrations";
import type { IntegrationRegistryVersionChannelRepairPreview } from "../../interfaces/promotion";

export type IntegrationRegistryVersionEligibilityProjection = Readonly<{
    versions: readonly IntegrationDefinitionVersion[];
    channels: IntegrationRegistryVersionChannelRepairPreview;
}>;

export function projectIntegrationRegistryVersionEligibility(
    previous: IntegrationDefinitionIndex,
    version: string,
    status: "blocked" | "inadmissible",
): IntegrationRegistryVersionEligibilityProjection {
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
    return {
        versions,
        channels: {
            current: channels(previous),
            next: {
                ...channel("stable", newest(installable.filter((entry) => !isIntegrationPrerelease(entry.version)))),
                ...channel("latest", newest(installable)),
            },
        },
    };
}

function channels(index: Readonly<{ stable?: string; latest?: string }>) {
    return {
        ...(index.stable ? { stable: index.stable } : {}),
        ...(index.latest ? { latest: index.latest } : {}),
    };
}

function channel(name: "stable" | "latest", version: IntegrationDefinitionVersion | undefined) {
    return version ? { [name]: version.version } : {};
}

function newest(versions: readonly IntegrationDefinitionVersion[]): IntegrationDefinitionVersion | undefined {
    return versions.reduce<IntegrationDefinitionVersion | undefined>((current, candidate) => {
        if (!current || integrationVersionReleaseLevel(current.version, candidate.version)) {
            return candidate;
        }
        return current;
    }, undefined);
}
