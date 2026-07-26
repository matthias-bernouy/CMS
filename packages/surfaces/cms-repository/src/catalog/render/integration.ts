import type { RepositoryCatalogIntegrationPage } from "../contracts";
import { repositoryVersionPath, REPOSITORY_CATALOG_ROOT } from "../routes";
import { versionContentView } from "../view/models";
import { renderCompatibilitySummary } from "./compatibility";
import { escapeAttr, escapeHtml, formatBytes, renderBreadcrumbs, renderStatusBadges } from "./html";
import { renderVersionSections } from "./versionSections";

export function renderRepositoryIntegration(data: RepositoryCatalogIntegrationPage): string {
    const integration = data.integration;
    const featured = data.featuredVersion ? versionContentView(integration, data.featuredVersion) : undefined;
    return `<main class="repository-catalog repository-integration">
${renderBreadcrumbs([{ label: "Integrations", href: REPOSITORY_CATALOG_ROOT }, { label: integration.label }])}
<header><h1>${escapeHtml(integration.label)}</h1>${integration.description ? `<p>${escapeHtml(integration.description)}</p>` : ""}</header>
<dl>
${integration.category ? `<div><dt>Category</dt><dd>${escapeHtml(integration.category)}</dd></div>` : ""}
<div><dt>Stable</dt><dd>${escapeHtml(integration.stable ?? "Not promoted")}</dd></div>
<div><dt>Latest</dt><dd>${escapeHtml(integration.latest ?? "Not published")}</dd></div>
</dl>
${renderVersions(data)}
${featured ? `<section class="featured-version"><h2>Featured version ${escapeHtml(featured.version)}</h2>${renderVersionSections(featured)}</section>` : ""}
</main>`;
}

function renderVersions(data: RepositoryCatalogIntegrationPage): string {
    const integration = data.integration;
    return `<section class="version-history"><h2>Version history</h2><ol>${integration.versions
        .map(
            (entry) => `<li>
<a href="${escapeAttr(repositoryVersionPath(integration.kind, entry.version))}">${escapeHtml(entry.version)}</a>
${renderStatusBadges(integration.stable === entry.version, integration.latest === entry.version)}
<span>${renderCompatibilitySummary(entry.compatibility)}</span>
${entry.package?.digest ? `<code>${escapeHtml(entry.package.digest)}</code>` : ""}
${entry.package?.canonicalBytes === undefined ? "" : `<span>${escapeHtml(formatBytes(entry.package.canonicalBytes))}</span>`}
</li>`,
        )
        .join("")}</ol></section>`;
}
