import type { RepositoryCatalogListView } from "../view/models";
import { compatibilityOutcome } from "../view/models";
import { repositoryIntegrationPath } from "../routes";
import { escapeAttr, escapeHtml, humanLabel, selected } from "./html";

export function renderRepositoryCatalogList(view: RepositoryCatalogListView): string {
    const count = view.items.length;
    return `<main class="repository-catalog repository-catalog-list">
<header><h1>Integration catalog</h1><p>Browse immutable integrations and their published versions.</p></header>
${renderFilters(view)}
<p role="status">${count} of ${view.total} integration${view.total === 1 ? "" : "s"}</p>
${count > 0 ? `<ul class="integration-grid">${view.items.map(renderItem).join("")}</ul>` : renderEmptyState()}
</main>`;
}

function renderFilters(view: RepositoryCatalogListView): string {
    return `<form action="/integrations" method="get" class="catalog-filters">
<label>Search <input type="search" name="q" maxlength="128" value="${escapeAttr(view.filters.query)}"></label>
${renderSelect("category", "Category", view.categories, view.filters.category)}
${renderSelect("provider", "Provider", view.providers, view.filters.provider)}
${renderSelect("compatibility", "Compatibility", view.compatibilityOutcomes, view.filters.compatibility)}
<button type="submit">Apply filters</button>
<a href="/integrations">Clear filters</a>
</form>`;
}

function renderSelect(name: string, label: string, values: readonly string[], active: string): string {
    const options = values
        .map(
            (value) =>
                `<option value="${escapeAttr(value)}"${selected(value, active)}>${escapeHtml(humanLabel(value))}</option>`,
        )
        .join("");
    return `<label>${label} <select name="${name}"><option value="">All</option>${options}</select></label>`;
}

function renderItem(item: RepositoryCatalogListView["items"][number]): string {
    const providers = item.technicalProviders ?? [];
    const artifacts = item.artifacts ?? [];
    return `<li><article class="integration-card">
<h2><a href="${escapeAttr(repositoryIntegrationPath(item.kind))}">${escapeHtml(item.label)}</a></h2>
${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
<dl>
${item.category ? `<div><dt>Category</dt><dd>${escapeHtml(item.category)}</dd></div>` : ""}
<div><dt>Stable</dt><dd>${escapeHtml(item.stable ?? "Not promoted")}</dd></div>
<div><dt>Latest</dt><dd>${escapeHtml(item.latest ?? "Not published")}</dd></div>
<div><dt>Compatibility</dt><dd>${escapeHtml(humanLabel(compatibilityOutcome(item)))}</dd></div>
</dl>
${providers.length > 0 ? `<p>Providers: ${providers.map(escapeHtml).join(", ")}</p>` : ""}
${artifacts.length > 0 ? `<p>Artifacts: ${artifacts.map(({ type, count }) => `${escapeHtml(humanLabel(type))} (${count})`).join(", ")}</p>` : ""}
</article></li>`;
}

function renderEmptyState(): string {
    return '<section class="catalog-empty"><h2>No matching integrations</h2><p>Change or clear the filters to browse the complete catalog.</p></section>';
}
