import { route, integrationRouteUrl } from "../api";
import type { IntegrationBrowserHost, IntegrationDefinition } from "../model";

export function renderDetail(host: IntegrationBrowserHost): void {
    const root = host.query<HTMLElement>("[data-detail-view]");
    const installation = host.installations.find((item) => item.id === host.selectedIntegrationId);
    if (!installation) {
        return;
    }
    const link = document.createElement("a");
    link.href = route("/admin/sources");
    link.textContent = "Open sources";
    root.replaceChildren(link);
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
