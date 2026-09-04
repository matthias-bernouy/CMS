import { DASHBOARD_SELECTED_EVENT, DASHBOARD_VIEW_SELECTED_EVENT } from "./events";
import { DashboardWorkspaceController } from "./workspace/controller";

export class CmsDashboardWorkspace extends DashboardWorkspaceController {
    override connectedCallback(): void {
        super.connectedCallback();
        this.shadowRoot?.addEventListener("click", this.onClick);
        window.addEventListener(DASHBOARD_SELECTED_EVENT, this.onSelected as EventListener);
        window.addEventListener(DASHBOARD_VIEW_SELECTED_EVENT, this.onViewSelected as EventListener);
        window.addEventListener("cms-dashboard-workspace:reload", this.onRuntimeReload);
        void this.loadModel();
    }

    disconnectedCallback(): void {
        this.disconnectWorkspace();
        this.shadowRoot?.removeEventListener("click", this.onClick);
        window.removeEventListener(DASHBOARD_SELECTED_EVENT, this.onSelected as EventListener);
        window.removeEventListener(DASHBOARD_VIEW_SELECTED_EVENT, this.onViewSelected as EventListener);
        window.removeEventListener("cms-dashboard-workspace:reload", this.onRuntimeReload);
    }

    private readonly onClick = (event: Event): void => {
        const path = (event.target as Element | null)?.closest<HTMLElement>("[data-view-path]")?.dataset.viewPath;
        if (path) {
            this.selectView(path);
        }
    };

    private readonly onSelected = (event: CustomEvent<{ id: string }>): void => {
        void this.loadDashboard(event.detail.id);
    };

    private readonly onViewSelected = (event: CustomEvent<{ path: string }>): void => {
        if (this.hasAttribute("profile")) {
            this.openDashboard(event.detail.path);
            return;
        }
        this.selectView(event.detail.path);
    };

    private readonly onRuntimeReload = (): void => {
        if (this.dashboard) {
            void this.loadDashboard(this.dashboard.id);
        }
    };

    private openDashboard(path: string): void {
        const basePath = document.querySelector('meta[name="basePath"]')?.getAttribute("content")?.replace(/\/+$/, "");
        const url = new URL(`${basePath ?? ""}/dashboards`, window.location.origin);
        if (this.dashboard?.id) {
            url.searchParams.set("id", this.dashboard.id);
        }
        if (path) {
            url.searchParams.set("view", path);
        }
        window.location.assign(`${url.pathname}${url.search}`);
    }
}

if (!customElements.get("cms-dashboard-workspace")) {
    customElements.define("cms-dashboard-workspace", CmsDashboardWorkspace);
}
