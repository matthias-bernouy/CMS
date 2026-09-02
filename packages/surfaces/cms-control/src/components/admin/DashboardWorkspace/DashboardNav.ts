import { Component } from "@bernouy/components/base";
import {
    DASHBOARD_NAVIGATION_EVENT,
    DASHBOARD_SELECTED_EVENT,
    DASHBOARD_VIEW_SELECTED_EVENT,
    type DashboardNavigationState,
    dispatchDashboardSelected,
    dispatchDashboardViewSelected,
} from "./events";
import {
    type OperatorNavigationSurface,
    renderDashboardSwitcher,
    renderOperatorLevel,
    renderOperatorProfile,
} from "./nav/operatorView";
import css from "./nav/style.css" with { type: "text" };
import template from "./nav/template.html" with { type: "text" };

export class CmsDashboardNav extends Component {
    private selectedId = "";

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.selectedId = new URL(window.location.href).searchParams.get("id") ?? "";
        this.shadowRoot?.addEventListener("click", this.onClick);
        this.shadowRoot?.addEventListener("change", this.onChange);
        window.addEventListener(DASHBOARD_SELECTED_EVENT, this.onSelected as EventListener);
        window.addEventListener(DASHBOARD_NAVIGATION_EVENT, this.onNavigation as EventListener);
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener("change", this.onChange);
        window.removeEventListener(DASHBOARD_SELECTED_EVENT, this.onSelected as EventListener);
        window.removeEventListener(DASHBOARD_NAVIGATION_EVENT, this.onNavigation as EventListener);
    }

    private surface(): OperatorNavigationSurface {
        const surface = this.getAttribute("surface");
        return surface === "switcher" || surface === "secondary" || surface === "profile" ? surface : "primary";
    }

    private select(id: string): void {
        this.selectedId = id;
        const url = new URL(window.location.href);
        url.searchParams.set("id", id);
        url.searchParams.delete("view");
        history.replaceState(null, "", url);
        dispatchDashboardSelected(id);
    }

    private readonly onClick = (event: Event): void => {
        const path = (event.target as Element | null)?.closest<HTMLElement>("[data-view-path]")?.dataset.viewPath;
        if (path) {
            event.preventDefault();
            if (this.isProfilePage()) {
                const target = (event.target as Element).closest<HTMLElement>("[data-view-path]");
                const href = target?.getAttribute("href");
                if (href) {
                    window.location.assign(href);
                }
                return;
            }
            dispatchDashboardViewSelected(path);
        }
    };

    private readonly onSelected = (event: CustomEvent<{ id: string }>): void => {
        this.selectedId = event.detail.id;
    };

    private readonly onNavigation = (event: CustomEvent<DashboardNavigationState>): void => {
        const { dashboards, dashboard, path, subject } = event.detail;
        this.selectedId = dashboard?.id ?? "";
        const surface = this.surface();
        if (surface === "profile") {
            renderOperatorProfile(this.shadowRoot!, subject, dashboard?.id ?? this.selectedId, path);
        } else if (surface === "switcher") {
            renderDashboardSwitcher(this.shadowRoot!, dashboards, this.selectedId);
        } else if (surface === "secondary" && this.isProfilePage()) {
            renderOperatorLevel(this.shadowRoot!, null, "", 2);
        } else {
            renderOperatorLevel(
                this.shadowRoot!,
                dashboard,
                this.isProfilePage() && surface === "primary" ? "" : path,
                surface === "primary" ? 1 : 2,
            );
        }
    };

    private readonly onChange = (event: Event): void => {
        const target = event.target;
        if (target instanceof HTMLElement && target.matches("[data-dashboard-switcher]")) {
            const id = (target as HTMLElement & { value: string }).value;
            if (id) {
                this.select(id);
            }
        }
    };

    private isProfilePage(): boolean {
        const basePath = document.querySelector('meta[name="basePath"]')?.getAttribute("content")?.replace(/\/+$/, "");
        return window.location.pathname === `${basePath ?? ""}/dashboards/profile`;
    }
}

if (!customElements.get("cms-dashboard-nav")) {
    customElements.define("cms-dashboard-nav", CmsDashboardNav);
}
