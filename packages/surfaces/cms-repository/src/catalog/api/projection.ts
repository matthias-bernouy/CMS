import { renderSafeMarkdown } from "@bernouy/cms-content";
import type {
    RepositoryCatalogIntegrationPage,
    RepositoryCatalogIntegrationSummary,
    RepositoryCatalogVersionContent,
    RepositoryCatalogVersionPage,
    RepositoryCatalogVersionSummary,
} from "../contracts";
import { repositoryPackageDownloadPath } from "../routes";
import { compatibilityOutcome, type RepositoryCatalogListView, versionContentView } from "../view/models";
import { formatBytes, humanLabel, labeledArtifacts, labeledProviders, labeledValue } from "../view/presentation";
import {
    REPOSITORY_CATALOG_API_SCHEMA,
    type RepositoryCatalogApiIntegration,
    type RepositoryCatalogApiIntegrationView,
    type RepositoryCatalogApiList,
    type RepositoryCatalogApiVersionDetail,
    type RepositoryCatalogApiVersionItem,
    type RepositoryCatalogApiVersionView,
} from "./contracts";
import { projectCatalogRelease } from "./releaseProjection";
import {
    repositoryCatalogIntegrationUrl,
    repositoryCatalogVersionUrl,
    repositoryReleaseNotesDownloadPath,
} from "./urls";

export function projectCatalogList(revision: string, view: RepositoryCatalogListView): RepositoryCatalogApiList {
    return {
        schema: REPOSITORY_CATALOG_API_SCHEMA,
        view: "list",
        revision,
        q: view.filters.query,
        category: view.filters.category,
        provider: view.filters.provider,
        compatibility: view.filters.compatibility,
        count: view.items.length,
        total: view.total,
        categories: view.categories.map(labeledValue),
        providers: view.providers.map(labeledValue),
        compatibilityOutcomes: view.compatibilityOutcomes.map(labeledValue),
        integrations: view.items.map(projectIntegration),
    };
}

export function projectCatalogIntegration(
    revision: string,
    page: RepositoryCatalogIntegrationPage,
): RepositoryCatalogApiIntegrationView {
    return {
        schema: REPOSITORY_CATALOG_API_SCHEMA,
        view: "integration",
        revision,
        ...projectIntegration(page.integration),
        ...(page.featuredVersion
            ? { featuredVersion: projectVersionDetail(page.integration, page.featuredVersion) }
            : {}),
    };
}

export function projectCatalogVersion(
    revision: string,
    page: RepositoryCatalogVersionPage,
): RepositoryCatalogApiVersionView {
    const integration = projectIntegration(page.integration);
    return {
        schema: REPOSITORY_CATALOG_API_SCHEMA,
        view: "version",
        revision,
        ...integration,
        ...projectVersionDetail(page.integration, page.version),
    };
}

function projectIntegration(summary: RepositoryCatalogIntegrationSummary): RepositoryCatalogApiIntegration {
    const outcome = compatibilityOutcome(summary);
    return {
        kind: summary.kind,
        label: summary.label,
        ...(summary.description === undefined ? {} : { description: summary.description }),
        ...(summary.category === undefined ? {} : { category: summary.category }),
        ...(summary.stable === undefined ? {} : { stable: summary.stable }),
        ...(summary.latest === undefined ? {} : { latest: summary.latest }),
        detailsUrl: repositoryCatalogIntegrationUrl(summary.kind),
        compatibilityOutcome: outcome,
        compatibilityLabel: humanLabel(outcome),
        compatibilityWarning: summary.compatibility?.warning ?? false,
        technicalProviders: labeledProviders(summary.technicalProviders ?? []),
        artifacts: labeledArtifacts(summary.artifacts ?? []),
        versions: summary.versions.map((version) => projectVersionItem(summary, version)),
    };
}

function projectVersionItem(
    integration: RepositoryCatalogIntegrationSummary,
    summary: RepositoryCatalogVersionSummary,
): RepositoryCatalogApiVersionItem {
    const outcome = compatibilityOutcome(summary);
    return {
        version: summary.version,
        isStable: integration.stable === summary.version,
        isLatest: integration.latest === summary.version,
        compatibilityOutcome: outcome,
        compatibilityLabel: humanLabel(outcome),
        compatibilityWarning: summary.compatibility?.warning ?? false,
        ...(summary.package?.digest === undefined ? {} : { packageDigest: summary.package.digest }),
        ...(summary.package?.canonicalBytes === undefined ? {} : { packageBytes: summary.package.canonicalBytes }),
        packageSize: formatBytes(summary.package?.canonicalBytes),
        detailsUrl: repositoryCatalogVersionUrl(integration.kind, summary.version),
        downloadUrl: repositoryPackageDownloadPath(integration.kind, summary.version),
        ...(summary.release
            ? {
                  releaseStatus: summary.release.status,
                  installable: summary.release.installable,
                  freshInstallOnly: summary.release.freshInstallOnly,
                  ...(summary.release.verificationOrigin
                      ? { verificationOrigin: summary.release.verificationOrigin }
                      : {}),
                  ...(summary.release.verificationOutcome
                      ? { verificationOutcome: summary.release.verificationOutcome }
                      : {}),
              }
            : {}),
    };
}

function projectVersionDetail(
    integration: RepositoryCatalogIntegrationSummary,
    content: RepositoryCatalogVersionContent,
): RepositoryCatalogApiVersionDetail {
    const view = versionContentView(integration, content);
    const currentCompatibility = view.compatibility
        ? [view.compatibility.root, ...(view.compatibility.revisions ?? [])].find(
              ({ reportId }) => reportId === view.compatibility?.currentReportId,
          )
        : undefined;
    const outcome = currentCompatibility?.outcome ?? "unreported";
    return {
        version: view.version,
        isStable: view.stable,
        isLatest: view.latest,
        compatibilityOutcome: outcome,
        compatibilityLabel: humanLabel(outcome),
        compatibilityWarning: view.compatibility?.warning ?? false,
        integrationUrl: repositoryCatalogIntegrationUrl(integration.kind),
        detailsUrl: repositoryCatalogVersionUrl(integration.kind, view.version),
        downloadUrl: repositoryPackageDownloadPath(integration.kind, view.version),
        ...(view.releaseNotes === undefined
            ? {}
            : { releaseNotesDownloadUrl: repositoryReleaseNotesDownloadPath(integration.kind, view.version) }),
        ...(view.package?.digest === undefined ? {} : { packageDigest: view.package.digest }),
        ...(view.package?.canonicalBytes === undefined ? {} : { packageBytes: view.package.canonicalBytes }),
        packageSize: formatBytes(view.package?.canonicalBytes),
        providers: labeledProviders(view.providers),
        artifacts: labeledArtifacts(view.artifacts),
        dependencies: view.dependencies.map((dependency) => ({
            ...dependency,
            integrationUrl: repositoryCatalogIntegrationUrl(dependency.kind),
        })),
        instructions: (view.definition.ui?.instructions ?? []).map(([title, markdown]) => ({
            title,
            html: renderSafeMarkdown(markdown),
        })),
        ...(view.releaseNotes === undefined ? {} : { releaseNotesHtml: renderSafeMarkdown(view.releaseNotes) }),
        ...(view.compatibility && currentCompatibility
            ? { compatibility: { ...view.compatibility, current: currentCompatibility } }
            : {}),
        ...(view.release === undefined ? {} : { release: projectCatalogRelease(view.release) }),
    };
}
