import { canonicalizeIJson, catalogueRevision } from "cms-repository/exports/contracts/protocol";
import type { ProviderInstallation } from "../interfaces/ProviderInstallation";

/** Tracks installation configuration without treating runtime observations as selection changes. */
export async function installationSelectionRevision(
    siteId: string,
    installations: readonly ProviderInstallation[],
): Promise<string> {
    const records = installations
        .map((installation) => [installation.id, canonicalizeIJson(installation)] as const)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return catalogueRevision({ siteId, records });
}
