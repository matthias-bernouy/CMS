import { installedCounts } from "../domain";
import type { IntegrationBrowserHost, IntegrationDefinition, IntegrationInstallationRow } from "../model";
import { integrationRouteUrl } from "../api";
import { cloneElement, text } from "./templates";
import { appendBadges, artifactLabels, formatRelativeDate, integrationIcon, statusLabel } from "./resources";

export function renderBrowser(host: IntegrationBrowserHost): void {
    renderInstallations(host);
    renderCounts(host);
}

export function renderCounts(host: IntegrationBrowserHost): void {
    text(host, "[data-installed-count]", host.installations.length);
    text(host, "[data-catalogue-count]", availableDefinitions(host).length);
}

export function renderInstallations(host: IntegrationBrowserHost): void {
    const root = host.query<HTMLElement>("[data-installations]");
    const rows = [...host.installations].sort((left, right) => left.label.localeCompare(right.label));
    root.replaceChildren();
    if (rows.length) root.append(cloneElement("installed-head"), ...rows.map(row => installationRow(host, row)));
    host.query<HTMLElement>("[data-installations-empty]").hidden = rows.length > 0;
}

export function availableDefinitions(host: IntegrationBrowserHost): IntegrationDefinition[] {
    const counts = installedCounts(host.installations);
    return host.definitions.filter(definition => !counts.has(definition.kind));
}

export function definitionFor(host: IntegrationBrowserHost, installation: IntegrationInstallationRow): IntegrationDefinition | undefined {
    return host.definitions.find(definition => definition.kind === installation.id);
}

function installationRow(host: IntegrationBrowserHost, installation: IntegrationInstallationRow): HTMLElement {
    const definition = definitionFor(host, installation);
    const row = cloneElement<HTMLAnchorElement>("installed-row");
    row.href = integrationRouteUrl({ view: "installation", id: installation.id });
    row.dataset.integrationId = installation.id;
    row.querySelector("[data-icon-host]")?.replaceWith(integrationIcon(definition));
    text(row, "[data-label]", installation.label);
    text(row, "[data-kind]", installation.id);
    const status = row.querySelector<HTMLElement>("[data-status]");
    if (status) {
        status.textContent = statusLabel(installation.status);
        status.classList.add(`status-${installation.status}`);
    }
    appendBadges(row.querySelector<HTMLElement>("[data-badges]")!, definition ? artifactLabels(definition) : ["Unknown"]);
    text(row, "[data-updated]", formatRelativeDate(installation.updatedAt));
    return row;
}
