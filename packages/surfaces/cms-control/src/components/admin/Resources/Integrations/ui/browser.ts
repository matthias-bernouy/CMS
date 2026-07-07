import { categories, installedCounts, matches } from "../domain";
import type { IntegrationBrowserHost, IntegrationDefinition, IntegrationInstanceRow } from "../model";
import { cloneElement, fillIcon, text } from "./templates";
import { appendBadges, artifactLabels, formatRelativeDate, integrationIcon, statusLabel } from "./resources";

export function renderBrowser(host: IntegrationBrowserHost): void {
    renderCategories(host);
    renderInstances(host);
    renderCatalogue(host);
    renderCounts(host);
}

export function renderCounts(host: IntegrationBrowserHost): void {
    text(host, "[data-installed-count]", host.instances.length);
    text(host, "[data-catalogue-count]", availableDefinitions(host).length);
}

export function renderCategories(host: IntegrationBrowserHost): void {
    const select = host.query<HTMLSelectElement>("[data-category]");
    select.replaceChildren(new Option("All categories", ""));
    for (const category of categories(availableDefinitions(host))) select.append(new Option(category, category));
}

export function renderInstances(host: IntegrationBrowserHost): void {
    const root = host.query<HTMLElement>("[data-instances]");
    const rows = [...host.instances].sort((left, right) => left.label.localeCompare(right.label));
    root.replaceChildren();
    if (rows.length) root.append(cloneElement("installed-head"), ...rows.map(row => instanceRow(host, row)));
    host.query<HTMLElement>("[data-instances-empty]").hidden = rows.length > 0;
}

export function renderCatalogue(host: IntegrationBrowserHost): void {
    const query = host.query<HTMLInputElement>("[data-search]").value.trim();
    const category = host.query<HTMLSelectElement>("[data-category]").value;
    const visible = availableDefinitions(host)
        .filter(definition => matches(definition, query, category))
        .sort((left, right) => left.label.localeCompare(right.label));
    host.query<HTMLElement>("[data-catalogue]").replaceChildren(...visible.map(definition => definitionCard(definition)));
    host.query<HTMLElement>("[data-catalogue-empty]").hidden = visible.length > 0;
    renderCounts(host);
}

export function availableDefinitions(host: IntegrationBrowserHost): IntegrationDefinition[] {
    const counts = installedCounts(host.instances);
    return host.definitions.filter(definition => !counts.has(definition.kind));
}

export function definitionFor(host: IntegrationBrowserHost, instance: IntegrationInstanceRow): IntegrationDefinition | undefined {
    return host.definitions.find(definition => definition.kind === instance.kind);
}

function instanceRow(host: IntegrationBrowserHost, instance: IntegrationInstanceRow): HTMLElement {
    const definition = definitionFor(host, instance);
    const row = cloneElement<HTMLButtonElement>("installed-row");
    row.dataset.instanceId = instance.id;
    row.querySelector("[data-icon-host]")?.replaceWith(integrationIcon(definition, instance.kind));
    text(row, "[data-label]", instance.label);
    text(row, "[data-kind]", instance.kind);
    const status = row.querySelector<HTMLElement>("[data-status]");
    if (status) {
        status.textContent = statusLabel(instance.status);
        status.classList.add(`status-${instance.status}`);
    }
    appendBadges(row.querySelector<HTMLElement>("[data-badges]")!, definition ? artifactLabels(definition) : ["Unknown"]);
    text(row, "[data-updated]", formatRelativeDate(instance.updatedAt));
    fillIcon(row, "[data-chevron]", "chevron");
    return row;
}

function definitionCard(definition: IntegrationDefinition): HTMLElement {
    const card = cloneElement<HTMLButtonElement>("catalogue-card");
    card.dataset.definitionKind = definition.kind;
    card.querySelector("[data-icon-host]")?.replaceWith(integrationIcon(definition, definition.kind));
    text(card, "[data-label]", definition.label);
    text(card, "[data-description]", definition.description ?? "");
    appendBadges(card.querySelector<HTMLElement>("[data-badges]")!, [definition.category ?? "Other", ...artifactLabels(definition)]);
    return card;
}
