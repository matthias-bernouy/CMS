import { catalogueRevision } from "cms-repository/exports/contracts/protocol";
import type { ProviderInstallation } from "../interfaces/ProviderInstallation";

/** Tracks installation configuration without treating runtime observations as selection changes. */
export async function installationSelectionRevision(
    siteId: string,
    installations: readonly ProviderInstallation[],
): Promise<string> {
    const records = await Promise.all(
        installations.map(
            async (installation) => [installation.id, await installationSelectionDigest(installation)] as const,
        ),
    );
    return installationSelectionRevisionFromDigests(siteId, records);
}

export function installationSelectionDigest(installation: ProviderInstallation): Promise<string> {
    return catalogueRevision(installation, 64);
}

export function installationSelectionRevisionFromDigests(
    siteId: string,
    values: readonly (readonly [string, string])[],
): Promise<string> {
    const records = [...values].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return catalogueRevision({ siteId, records });
}
