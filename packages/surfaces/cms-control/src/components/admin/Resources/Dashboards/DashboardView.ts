import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { NavigationItem } from "./domain/types";
import { renderDashboardSwitcher, renderRuntimeNavigation } from "./navigation/runtime";

class DashboardView extends HTMLElement {
    connectedCallback(): void {
        if (this.dataset.started) {
            return;
        }
        this.dataset.started = "true";
        void this.load();
    }

    private async load(): Promise<void> {
        const params = new URLSearchParams(location.search);
        const dashboardId = params.get("dashboardId");
        const viewId = params.get("viewId");
        if (!dashboardId || !viewId) {
            this.textContent = "Choose a dashboard view.";
            return;
        }
        const response = await fetch(
            `${getMetaBasePath()}/api/dashboard-view?dashboardId=${encodeURIComponent(dashboardId)}&viewId=${encodeURIComponent(viewId)}`,
            { cache: "no-store" },
        );
        if (!response.ok) {
            this.textContent = `View unavailable (${response.status}).`;
            return;
        }
        const view = (await response.json()) as {
            dashboard: string;
            label: string;
            html: string;
            navigation: NavigationItem[];
        };
        const back = document.createElement("a");
        back.slot = "back";
        back.href = `${getMetaBasePath()}/admin/dashboards`;
        back.textContent = "←";
        back.setAttribute("aria-label", "Back to dashboards");
        const heading = document.createElement("span");
        heading.slot = "title";
        heading.textContent = view.dashboard;
        renderRuntimeNavigation(dashboardId, view.navigation, viewId);
        void renderDashboardSwitcher(dashboardId);
        const content = document.createElement("div");
        content.setAttribute(
            "cms-source",
            `${getMetaBasePath()}/api/dashboard-context?dashboardId=${encodeURIComponent(dashboardId)} as dashboard`,
        );
        content.innerHTML = view.html;
        rewriteDashboardCapabilitySources(content, dashboardId, getMetaBasePath());
        const section = document.createElement("cms-detail-section");
        section.slot = "main";
        section.setAttribute("heading", view.label);
        section.append(content);
        const body = document.createElement("cms-shell-detail-body");
        body.slot = "body";
        body.append(section);
        const shell = document.createElement("cms-shell-detail");
        shell.setAttribute("size", "xl");
        shell.append(back, heading, body);
        const container = document.createElement("p9r-container");
        container.setAttribute("size", "xl");
        container.append(shell);
        this.replaceChildren(container);
    }
}

export function rewriteDashboardCapabilitySources(root: ParentNode, dashboardId: string, basePath: string): void {
    for (const source of root.querySelectorAll<HTMLElement>("[cms-source]")) {
        const value = source.getAttribute("cms-source") ?? "";
        const match = /^(\/\.cms\/call\/\S+?)(\s+as\s+[A-Za-z_$][\w$]*)?$/u.exec(value.trim());
        if (!match) {
            continue;
        }
        const endpoint = match[1]!;
        const separator = endpoint.includes("?") ? "&" : "?";
        source.setAttribute(
            "cms-source",
            `${basePath}/api/dashboard-call/${endpoint.slice("/.cms/call/".length)}${separator}dashboardId=${encodeURIComponent(dashboardId)}${match[2] ?? ""}`,
        );
    }
}

customElements.define("cms-dashboard-view", DashboardView);
