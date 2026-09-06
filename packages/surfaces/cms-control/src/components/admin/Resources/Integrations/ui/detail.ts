import "../management/IntegrationManagement";
import { route, integrationRouteUrl } from "../api";
import type { IntegrationBrowserHost, IntegrationDefinition } from "../model";
import { definitionFor } from "./browser";
import { cloneElement, fillIcon, text } from "./templates";

export function renderDetail(host: IntegrationBrowserHost): void {
    const root = host.query<HTMLElement>("[data-detail-view]");
    const installation = host.installations.find((item) => item.id === host.selectedIntegrationId);
    if (!installation) {
        return;
    }
    const definition = definitionFor(host, installation);
    const shell = cloneElement("detail-shell");
    const content = shell.querySelector("template")!.content;
    shell.setAttribute(
        "cms-source",
        `${route("/api/integrations/installations")}?id=${encodeURIComponent(installation.id)} as integration`,
    );
    text(content, "[data-title]", installation.label);
    text(content, "[data-description]", definition?.description ?? "No description.");
    content.querySelector<HTMLElement>("[data-run-sync]")!.dataset.integrationId = installation.id;
    content.querySelector<HTMLElement>("[data-management]")!.setAttribute("installation-id", installation.id);
    const upgrade = content.querySelector<HTMLElement>("[data-upgrade-panel]")!;
    upgrade.dataset.integrationId = installation.id;
    upgrade.dataset.currentVersion = installation.definitionVersion;
    fillIcon(content, "[data-back-icon]", "table");
    fillIcon(content, "[data-grid-icon]", "grid");
    renderLinkedResources(content.querySelector<HTMLElement>("[data-linked]")!, host, definition);
    root.replaceChildren(shell);
}

export function renderLinkedResources(
    root: HTMLElement,
    host: IntegrationBrowserHost,
    definition?: IntegrationDefinition,
): void {
    const dependencies = definition?.dependencies ?? [];
    root.replaceChildren();
    for (const dependency of dependencies) {
        const installed = host.installations.find((item) => item.id === dependency.kind);
        const item = document.createElement(installed ? "a" : "p");
        item.textContent = `${dependency.name || dependency.kind}: ${installed ? "Installed" : dependency.optional ? "Optional" : "Required"}${dependency.versionRange ? ` (${dependency.versionRange})` : ""}`;
        if (installed) {
            item.setAttribute("href", integrationRouteUrl({ view: "installation", id: installed.id }));
        }
        root.append(item);
    }
    if (!dependencies.length) {
        root.textContent = "No related resources declared.";
    }
}
