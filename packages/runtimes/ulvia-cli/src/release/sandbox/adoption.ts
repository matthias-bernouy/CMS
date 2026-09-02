import { integrationVersionSatisfies, legacyBaselineAdoptionConfirmation } from "@bernouy/cms-integrations";
import type { LocalReleasePackage } from "../types";
import type { ReleaseSandboxClient } from "./client";

export async function adoptRequiredLegacyBaselines(
    baseline: LocalReleasePackage,
    target: LocalReleasePackage,
    client: ReleaseSandboxClient,
): Promise<void> {
    const sourceVersion = baseline.package.envelope.version;
    const sourcePackageDigest = baseline.package.digest;
    const targetVersion = target.package.envelope.version;
    const targetPackageDigest = target.package.digest;
    for (const connector of target.definition.connectors ?? []) {
        const connectorKey = connector.connectorKey;
        const adoption = connector.migration?.supportedSources.find(
            (source) =>
                integrationVersionSatisfies(sourceVersion, source.range) &&
                source.legacyAdoption?.definitionVersion === sourceVersion &&
                source.legacyAdoption.packageDigest === sourcePackageDigest,
        )?.legacyAdoption;
        if (!connectorKey || !adoption) {
            continue;
        }
        await client.adoptBaseline(target.package.envelope.kind, {
            version: targetVersion,
            connectorKey,
            sourceVersion,
            sourcePackageDigest,
            confirmation: legacyBaselineAdoptionConfirmation({
                integrationId: target.package.envelope.kind,
                sourceVersion,
                sourcePackageDigest,
                targetVersion,
                targetPackageDigest,
                connectorKey,
            }),
        });
    }
}
