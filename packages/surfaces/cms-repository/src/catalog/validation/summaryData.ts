import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type { RepositoryCatalogIntegrationSummary, RepositoryCatalogPackageSummary } from "../contracts";
import { assertCompatibilitySummary } from "./compatibilityData";
import { boundedArray, boundedText, REPOSITORY_CATALOG_LIMITS, RepositoryCatalogDataError } from "./limits";
import { assertReleaseSummary } from "./releaseData";

const DIGEST = /^[a-f0-9]{64}$/;

export function assertRepositoryCatalogSummary(summary: RepositoryCatalogIntegrationSummary): void {
    assertIntegrationPackageKind(summary.kind);
    boundedText(summary.kind, "integration kind", REPOSITORY_CATALOG_LIMITS.identifierBytes);
    boundedText(summary.label, "integration label", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
    boundedText(summary.description, "integration description", REPOSITORY_CATALOG_LIMITS.descriptionBytes, false);
    boundedText(summary.category, "integration category", REPOSITORY_CATALOG_LIMITS.shortTextBytes, false);
    const versions = boundedArray(
        summary.versions,
        "integration versions",
        REPOSITORY_CATALOG_LIMITS.versionsPerIntegration,
    );
    if (versions.length === 0) {
        throw new RepositoryCatalogDataError("An integration must list at least one version");
    }
    const versionIds = new Set<string>();
    for (const entry of versions) {
        assertIntegrationPackageVersion(entry.version);
        if (versionIds.has(entry.version)) {
            throw new RepositoryCatalogDataError(`Duplicate integration version ${entry.version}`);
        }
        versionIds.add(entry.version);
        assertPackageSummary(entry.package);
        assertCompatibilitySummary(entry.compatibility);
        assertReleaseSummary(entry.release);
    }
    assertChannel(summary.stable, "stable", versionIds);
    assertChannel(summary.latest, "latest", versionIds);
    for (const provider of boundedArray(
        summary.technicalProviders ?? [],
        "technical providers",
        REPOSITORY_CATALOG_LIMITS.providers,
    )) {
        boundedText(provider, "technical provider", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
    }
    for (const artifact of boundedArray(
        summary.artifacts ?? [],
        "artifact summaries",
        REPOSITORY_CATALOG_LIMITS.artifactTypes,
    )) {
        boundedText(artifact.type, "artifact type", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
        if (!Number.isSafeInteger(artifact.count) || artifact.count < 0) {
            throw new RepositoryCatalogDataError("Artifact count must be a non-negative safe integer");
        }
    }
    assertCompatibilitySummary(summary.compatibility);
}

export function assertPackageSummary(value: RepositoryCatalogPackageSummary | undefined): void {
    if (!value) {
        return;
    }
    if (value.digest !== undefined && !DIGEST.test(value.digest)) {
        throw new RepositoryCatalogDataError("Package digest must be lowercase SHA-256");
    }
    if (
        value.canonicalBytes !== undefined &&
        (!Number.isSafeInteger(value.canonicalBytes) ||
            value.canonicalBytes < 0 ||
            value.canonicalBytes > REPOSITORY_CATALOG_LIMITS.packageBytes)
    ) {
        throw new RepositoryCatalogDataError("Package size exceeds the catalog limit");
    }
}

function assertChannel(value: string | undefined, name: string, versions: ReadonlySet<string>): void {
    if (value === undefined) {
        return;
    }
    assertIntegrationPackageVersion(value);
    if (!versions.has(value)) {
        throw new RepositoryCatalogDataError(`${name} must reference a listed version`);
    }
}
