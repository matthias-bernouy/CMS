import { route } from "../api";
import type { IntegrationBrowserHost } from "../model";
import { definitionFor } from "./browser";
import { cloneElement, fillIcon, text } from "./templates";
import { renderPlaceholder } from "./resources";

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
    const upgrade = content.querySelector<HTMLElement>("[data-upgrade-panel]")!;
    upgrade.dataset.integrationId = installation.id;
    upgrade.dataset.currentVersion = installation.definitionVersion;
    fillIcon(content, "[data-back-icon]", "table");
    fillIcon(content, "[data-grid-icon]", "grid");
    renderLinkedPlaceholder(content.querySelector<HTMLElement>("[data-linked]")!);
    root.replaceChildren(shell);
}

export function renderLinkedPlaceholder(root: HTMLElement): void {
    renderPlaceholder(
        root,
        "Coming soon",
        "Compatibility data will be displayed here when integrations declare their relationships.",
    );
}
