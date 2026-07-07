import { route } from "../api";
import type { IntegrationBrowserHost } from "../model";
import { definitionFor } from "./browser";
import { cloneElement, fillIcon, text } from "./templates";
import { renderPlaceholder } from "./resources";

export function renderDetail(host: IntegrationBrowserHost): void {
    const root = host.query<HTMLElement>("[data-detail-view]");
    const instance = host.instances.find(item => item.id === host.selectedInstanceId);
    if (!instance) {
        host.closeDetail();
        return;
    }
    const definition = definitionFor(host, instance);
    const shell = cloneElement("detail-shell");
    const content = shell.querySelector("template")!.content;
    shell.setAttribute("cms-source", `${route("/api/integrations/instances")}?id=${encodeURIComponent(instance.id)} as integration`);
    text(content, "[data-title]", instance.label);
    text(content, "[data-description]", definition?.description ?? "No description.");
    content.querySelector<HTMLElement>("[data-run-sync]")!.dataset.instanceId = instance.id;
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
