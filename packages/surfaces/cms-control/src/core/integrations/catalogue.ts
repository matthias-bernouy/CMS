import type { IntegrationDefinition, IntegrationInstallation } from "@bernouy/cms-integrations";
import { escapeAttr } from "@bernouy/http-runner/html";

export type IntegrationCatalogueBadge = {
    label: string;
    className: string;
};

export type IntegrationCatalogueItem = {
    kind: string;
    label: string;
    description: string;
    category: string;
    setupUrl: string;
    iconHtml: string;
    badges: IntegrationCatalogueBadge[];
};

export type IntegrationCatalogueView = {
    items: IntegrationCatalogueItem[];
    categories: string[];
    count: number;
    total: number;
    hasItems: boolean;
};

export function buildIntegrationCatalogue(input: {
    definitions: IntegrationDefinition[];
    installations: Pick<IntegrationInstallation, "id">[];
    query: string;
    category: string;
    basePath: string;
}): IntegrationCatalogueView {
    const installed = new Set(input.installations.map(installation => installation.id));
    const available = input.definitions
        .filter(definition => !installed.has(definition.kind))
        .sort((left, right) => left.label.localeCompare(right.label));
    const categories = Array.from(new Set(available.map(definition => categoryLabel(definition)))).sort();
    const query = input.query.trim().toLowerCase();
    const category = input.category.trim();
    const items = available
        .filter(definition => matches(definition, query, category))
        .map(definition => catalogueItem(definition, input.basePath));

    return {
        items,
        categories,
        count: items.length,
        total: available.length,
        hasItems: items.length > 0,
    };
}

function catalogueItem(definition: IntegrationDefinition, basePath: string): IntegrationCatalogueItem {
    const category = categoryLabel(definition);
    return {
        kind: definition.kind,
        label: definition.label,
        description: definition.description ?? "",
        category,
        setupUrl: `${basePath}/admin/integrations?setup=${encodeURIComponent(definition.kind)}`,
        iconHtml: iconHtml(definition, basePath),
        badges: badgeLabels([category, ...artifactLabels(definition)]),
    };
}

function matches(definition: IntegrationDefinition, query: string, category: string): boolean {
    const categoryMatch = !category || category === categoryLabel(definition);
    if (!categoryMatch) return false;
    if (!query) return true;
    return [definition.kind, definition.label, definition.category, definition.description]
        .join(" ")
        .toLowerCase()
        .includes(query);
}

function categoryLabel(definition: IntegrationDefinition): string {
    return definition.category ?? "Other";
}

function artifactLabels(definition: IntegrationDefinition): string[] {
    const types = Array.from(new Set((definition.artifacts ?? []).map(artifact => artifact.type)));
    return types.length ? types.map(typeLabel) : ["No artifacts"];
}

function badgeLabels(labels: string[]): IntegrationCatalogueBadge[] {
    const visible = labels.slice(0, 4).map(label => ({ label, className: "badge" }));
    const remaining = labels.length - visible.length;
    return remaining > 0
        ? [...visible, { label: `+${remaining} others`, className: "badge badge-muted" }]
        : visible;
}

function typeLabel(type: string): string {
    if (type === "sourceOverlay") return "Source overlay";
    return type[0]!.toUpperCase() + type.slice(1);
}

function iconHtml(definition: IntegrationDefinition, basePath: string): string {
    const icon = definition.icon?.path
        ? imageIconHtml(definition, definition.icon.path, basePath)
        : fallbackIconSvg();
    return `<span class="integration-icon" aria-hidden="true">${icon}</span>`;
}

function imageIconHtml(definition: IntegrationDefinition, path: string, basePath: string): string {
    const params = new URLSearchParams({ kind: definition.kind, path });
    if (definition.version) params.set("version", definition.version);
    const src = `${basePath}/api/integrations/asset?${params.toString()}`;
    return `<img src="${escapeAttr(src)}" alt="" decoding="async">`;
}

function fallbackIconSvg(): string {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"></rect><rect x="14" y="4" width="6" height="6" rx="1"></rect><rect x="4" y="14" width="6" height="6" rx="1"></rect><rect x="14" y="14" width="6" height="6" rx="1"></rect></svg>`;
}
