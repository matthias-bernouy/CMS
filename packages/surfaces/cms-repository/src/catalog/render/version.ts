import type { RepositoryCatalogVersionPage } from "../contracts";
import { repositoryIntegrationPath, REPOSITORY_CATALOG_ROOT } from "../routes";
import { versionContentView } from "../view/models";
import { renderCompatibilityHistory } from "./compatibility";
import { escapeHtml, renderBreadcrumbs, renderStatusBadges } from "./html";
import { renderVersionSections } from "./versionSections";

export function renderRepositoryVersion(data: RepositoryCatalogVersionPage): string {
    const view = versionContentView(data.integration, data.version);
    return `<main class="repository-catalog repository-version">
${renderBreadcrumbs([
    { label: "Integrations", href: REPOSITORY_CATALOG_ROOT },
    { label: data.integration.label, href: repositoryIntegrationPath(data.integration.kind) },
    { label: view.version },
])}
<header><h1>${escapeHtml(data.integration.label)} ${escapeHtml(view.version)}</h1>
${renderStatusBadges(view.stable, view.latest)}</header>
${data.version.definition.description ? `<p>${escapeHtml(data.version.definition.description)}</p>` : ""}
${renderVersionSections(view)}
${renderCompatibilityHistory(view.compatibility)}
</main>`;
}
