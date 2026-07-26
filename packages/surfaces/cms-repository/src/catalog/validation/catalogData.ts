import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import type {
    RepositoryCatalogDocument,
    RepositoryCatalogIntegrationPage,
    RepositoryCatalogIntegrationSummary,
    RepositoryCatalogVersionContent,
    RepositoryCatalogVersionPage,
} from "../contracts";
import { assertCompatibilityHistory } from "./compatibilityData";
import { boundedArray, boundedText, REPOSITORY_CATALOG_LIMITS, RepositoryCatalogDataError } from "./limits";
import { assertPackageSummary, assertRepositoryCatalogSummary } from "./summaryData";

export function assertCatalogListDocument(
    document: RepositoryCatalogDocument<readonly RepositoryCatalogIntegrationSummary[]>,
): void {
    assertDocument(document);
    const entries = boundedArray(document.value, "catalog integrations", REPOSITORY_CATALOG_LIMITS.integrations);
    const kinds = new Set<string>();
    for (const entry of entries) {
        assertRepositoryCatalogSummary(entry);
        if (kinds.has(entry.kind)) {
            throw new RepositoryCatalogDataError(`Duplicate integration kind ${entry.kind}`);
        }
        kinds.add(entry.kind);
    }
}

export function assertIntegrationPageDocument(
    document: RepositoryCatalogDocument<RepositoryCatalogIntegrationPage>,
    expectedKind: string,
): void {
    assertDocument(document);
    assertRepositoryCatalogSummary(document.value.integration);
    if (document.value.integration.kind !== expectedKind) {
        throw new RepositoryCatalogDataError("Integration page identity does not match its route");
    }
    if (document.value.featuredVersion) {
        assertVersionContent(document.value.featuredVersion, expectedKind);
        if (
            !document.value.integration.versions.some(
                ({ version }) => version === document.value.featuredVersion?.version,
            )
        ) {
            throw new RepositoryCatalogDataError("Featured version is not listed by the integration");
        }
    }
}

export function assertVersionPageDocument(
    document: RepositoryCatalogDocument<RepositoryCatalogVersionPage>,
    expectedKind: string,
    expectedVersion: string,
): void {
    assertDocument(document);
    assertRepositoryCatalogSummary(document.value.integration);
    assertVersionContent(document.value.version, expectedKind);
    if (document.value.integration.kind !== expectedKind || document.value.version.version !== expectedVersion) {
        throw new RepositoryCatalogDataError("Version page identity does not match its route");
    }
    if (!document.value.integration.versions.some(({ version }) => version === expectedVersion)) {
        throw new RepositoryCatalogDataError("Exact version is not listed by the integration");
    }
}

function assertDocument(document: { revision: string }): void {
    boundedText(document.revision, "catalog revision", REPOSITORY_CATALOG_LIMITS.identifierBytes);
    if (/\p{Cc}/u.test(document.revision)) {
        throw new RepositoryCatalogDataError("Catalog revision contains control characters");
    }
}

function assertVersionContent(content: RepositoryCatalogVersionContent, expectedKind: string): void {
    assertIntegrationPackageVersion(content.version);
    if (content.definition.kind !== expectedKind) {
        throw new RepositoryCatalogDataError("Version definition kind does not match its integration");
    }
    if (content.definition.version && content.definition.version !== content.version) {
        throw new RepositoryCatalogDataError("Version definition version does not match its route");
    }
    boundedText(content.definition.label, "definition label", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
    boundedText(
        content.definition.description,
        "definition description",
        REPOSITORY_CATALOG_LIMITS.descriptionBytes,
        false,
    );
    boundedArray(
        content.definition.dependencies ?? [],
        "definition dependencies",
        REPOSITORY_CATALOG_LIMITS.dependencies,
    );
    for (const dependency of content.definition.dependencies ?? []) {
        boundedText(dependency.name, "dependency name", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
        assertIntegrationPackageKind(dependency.kind);
        boundedText(dependency.kind, "dependency kind", REPOSITORY_CATALOG_LIMITS.identifierBytes);
        boundedText(dependency.versionRange, "dependency range", REPOSITORY_CATALOG_LIMITS.shortTextBytes, false);
    }
    boundedArray(content.definition.artifacts ?? [], "definition artifacts", REPOSITORY_CATALOG_LIMITS.artifacts);
    boundedArray(content.definition.connectors ?? [], "definition connectors", REPOSITORY_CATALOG_LIMITS.providers);
    boundedArray(content.definition.provisions ?? [], "definition provisions", REPOSITORY_CATALOG_LIMITS.providers);
    for (const provider of [
        ...(content.definition.connectors ?? []).map((connector) => connector.provider),
        ...(content.definition.provisions ?? []).map((provision) => provision.provider),
    ]) {
        boundedText(provider, "definition provider", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
    }
    boundedArray(
        content.definition.ui?.instructions ?? [],
        "definition instructions",
        REPOSITORY_CATALOG_LIMITS.instructions,
    );
    for (const instruction of content.definition.ui?.instructions ?? []) {
        boundedText(instruction[0], "instruction title", REPOSITORY_CATALOG_LIMITS.shortTextBytes);
        boundedText(instruction[1], "instruction Markdown", REPOSITORY_CATALOG_LIMITS.markdownBytes);
    }
    boundedText(content.releaseNotes, "release notes", REPOSITORY_CATALOG_LIMITS.markdownBytes, false);
    assertPackageSummary(content.package);
    if (content.compatibility) {
        assertCompatibilityHistory(content.compatibility);
    }
}
