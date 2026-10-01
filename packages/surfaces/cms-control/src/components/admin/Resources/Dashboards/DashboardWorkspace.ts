import {
    deletePrivateDashboard,
    installDashboardCollection,
    loadDashboardExplore,
    loadDashboards,
    postDashboard,
} from "./domain/api";
import { renderCollectionMounts, renderMemberDashboardList, renderMembers } from "./render";
import type { AvailableView, Dashboard, ExploreDashboard, User } from "./domain/types";
import type { DashboardNavigationEditor } from "./editor/NavigationEditor";
import type { DashboardNav } from "./navigation/DashboardNav";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

class DashboardWorkspace extends HTMLElement {
    private dashboards: Dashboard[] = [];
    private views: AvailableView[] = [];
    private users: User[] = [];
    private selectedId = "";
    private catalogue: ExploreDashboard[] = [];
    private collectionRevision = 0;

    connectedCallback(): void {
        if (this.querySelector("[data-list]")) {
            return;
        }
        this.innerHTML = `<style>${css}</style>${template}`;
        this.querySelector("[data-view-error]")!.addEventListener("retry", () => void this.load());
        this.selectedId = new URLSearchParams(location.search).get("dashboardId") ?? "";
        document
            .querySelector("[data-create-dashboard-action]")
            ?.addEventListener("click", () => this.createModal().showModal());
        this.querySelector("[data-create-form]")!.addEventListener("submit", (event) => {
            event.preventDefault();
            void this.create();
        });
        this.querySelector("[data-create-cancel]")!.addEventListener("click", () => this.createModal().hide());
        this.querySelector("[data-delete-open]")!.addEventListener("click", () => this.deleteModal().showModal());
        this.querySelector("[data-delete-cancel]")!.addEventListener("click", () => this.deleteModal().hide());
        this.querySelector("[data-delete-confirm]")!.addEventListener("click", () => void this.deleteDashboard());
        this.querySelector("[data-list]")!.addEventListener("click", (event) => void this.onExploreClick(event));
        this.querySelector("[data-save]")!.addEventListener("click", () => void this.save());
        this.querySelector("[data-collection-save]")!.addEventListener("click", () => void this.saveCollectionAccess());
        this.querySelector("[data-collection-copy]")!.addEventListener(
            "click",
            () => void this.copyCollectionDashboard(),
        );
        this.querySelectorAll("[data-add-member]").forEach((button) => {
            button.addEventListener("click", () => void this.changeMember("assign"));
        });
        this.querySelectorAll("[data-member-list]").forEach((list) => {
            list.addEventListener("click", (event) => {
                const id = (event.target as HTMLElement).closest<HTMLElement>("[data-remove-member]")?.dataset
                    .removeMember;
                if (id) {
                    void this.changeMember("unassign", id);
                }
            });
        });
        void this.load();
    }

    private async load(): Promise<void> {
        this.showState("loading");
        try {
            const data = await loadDashboards();
            this.dashboards = data.dashboards;
            this.views = data.views;
            this.users = data.users;
            if (data.mode === "member") {
                document.querySelector("[data-create-dashboard-action]")?.setAttribute("hidden", "");
                this.navigation()?.render(this.dashboards, "", true);
                this.querySelector("[data-overview]")!.removeAttribute("hidden");
                this.querySelector("[data-editor]")!.setAttribute("hidden", "");
                this.querySelector("[data-collection]")!.setAttribute("hidden", "");
                renderMemberDashboardList(this, this.dashboards);
                this.showState("ready");
                this.status("");
                return;
            }
            document.querySelector("[data-create-dashboard-action]")?.removeAttribute("hidden");
            if (this.selectedId && !this.dashboards.some((item) => item.id === this.selectedId)) {
                this.selectedId = "";
            }
            if (this.selectedId) {
                this.select(this.selectedId);
            } else {
                this.showOverview();
                this.navigation()?.render(this.dashboards, "", false);
                await this.loadExplore();
            }
            this.showState("ready");
            this.status("");
        } catch (error) {
            this.querySelector("[data-view-error-message]")!.textContent =
                error instanceof Error ? error.message : "Dashboards could not be loaded.";
            this.showState("error");
        }
    }

    private showState(state: "loading" | "error" | "ready"): void {
        this.querySelector<HTMLElement>("[data-view-loading]")!.hidden = state !== "loading";
        this.querySelector<HTMLElement>("[data-view-error]")!.hidden = state !== "error";
        if (state !== "ready") {
            this.querySelector<HTMLElement>("[data-overview]")!.hidden = true;
            this.querySelector<HTMLElement>("[data-editor]")!.hidden = true;
            this.querySelector<HTMLElement>("[data-collection]")!.hidden = true;
        }
        this.setAttribute("aria-busy", String(state === "loading"));
    }

    private select(id: string): void {
        this.selectedId = id;
        history.replaceState(null, "", `${location.pathname}?dashboardId=${encodeURIComponent(id)}`);
        this.navigation()?.render(this.dashboards, id, false);
        const record = this.dashboards.find((item) => item.id === id);
        if (!record) {
            return;
        }
        this.querySelector("[data-overview]")!.setAttribute("hidden", "");
        if (record?.origin?.kind === "collection") {
            this.showCollectionDashboard(record);
            return;
        }
        this.querySelector("[data-collection]")!.setAttribute("hidden", "");
        this.querySelector("[data-editor]")!.removeAttribute("hidden");
        this.querySelector("[data-members]")!.removeAttribute("hidden");
        this.querySelector("[data-editor-title]")!.textContent = record.name;
        this.querySelector("[data-state]")!.textContent = record.enabled ? "Active" : "Inactive";
        (this.querySelector("[data-name]") as HTMLElement & { value: string }).value = record.name;
        (this.querySelector("[data-icon]") as HTMLElement & { value: string }).value = record.icon ?? "layout";
        const enabled = this.querySelector("[data-enabled]") as HTMLInputElement;
        enabled.checked = record.enabled;
        this.editor().views = this.views;
        this.editor().value = record.navigation ?? [];
        renderMembers(this.querySelector("[data-editor]")!, this.users, record.members);
    }

    private showCollectionDashboard(record: Dashboard): void {
        this.querySelector("[data-editor]")!.setAttribute("hidden", "");
        const panel = this.querySelector("[data-collection]")!;
        panel.removeAttribute("hidden");
        panel.querySelector("[data-collection-name]")!.textContent = record.name;
        panel.querySelector("[data-collection-description]")!.textContent = record.description ?? "";
        panel.querySelector("[data-collection-origin]")!.textContent =
            `${record.collectionName} · ${record.origin!.publisherId} / ${record.origin!.collectionId}`;
        (panel.querySelector("[data-collection-enabled]") as HTMLInputElement).checked = record.enabled;
        const first = record.mounts[0];
        (panel.querySelector("[data-collection-open]") as HTMLAnchorElement).href = first
            ? `${location.pathname}/view?dashboardId=${encodeURIComponent(record.id)}&viewId=${encodeURIComponent(`${first.collectionId}:${first.viewId}`)}`
            : "#";
        renderCollectionMounts(panel as HTMLElement, record);
        renderMembers(panel as HTMLElement, this.users, record.members);
    }

    private async save(): Promise<void> {
        try {
            const name = (this.querySelector("[data-name]") as HTMLElement & { value: string }).value;
            const current = this.dashboards.find((item) => item.id === this.selectedId);
            if (!current || current.origin) {
                return;
            }
            await postDashboard("dashboard", {
                id: current.id,
                revision: current.revision,
                name,
                icon: (this.querySelector("[data-icon]") as HTMLElement & { value: string }).value,
                enabled: (this.querySelector("[data-enabled]") as HTMLInputElement).checked,
                navigation: this.editor().value,
            });
            await this.load();
            this.status("Dashboard saved.");
        } catch (error) {
            this.status(String(error));
        }
    }

    private async changeMember(action: "assign" | "unassign", subjectId?: string): Promise<void> {
        if (!this.selectedId) {
            return;
        }
        try {
            const panel = this.memberPanel();
            const selected = subjectId ?? (panel.querySelector("[data-user]") as HTMLElement & { value: string }).value;
            await postDashboard("dashboard-members", { dashboardId: this.selectedId, subjectId: selected, action });
            await this.load();
            this.status(action === "assign" ? "Member added." : "Member removed.");
        } catch (error) {
            this.status(String(error));
        }
    }

    private async saveCollectionAccess(): Promise<void> {
        const record = this.dashboards.find((item) => item.id === this.selectedId);
        if (!record?.origin) {
            return;
        }
        try {
            await postDashboard("dashboard", {
                id: record.id,
                revision: record.revision,
                enabled: (this.querySelector("[data-collection-enabled]") as HTMLInputElement).checked,
            });
            await this.load();
            this.status("Dashboard access saved.");
        } catch (error) {
            this.status(String(error));
        }
    }

    private async copyCollectionDashboard(): Promise<void> {
        const record = this.dashboards.find((item) => item.id === this.selectedId);
        if (!record?.origin) {
            return;
        }
        try {
            const copy = (await postDashboard("dashboards", {
                name: `${record.name.slice(0, 115)} copy`,
                icon: record.icon ?? "layout",
                navigation: record.navigation ?? [],
            })) as Dashboard;
            this.selectedId = copy.id;
            await this.load();
            this.status("Site dashboard created. It starts inactive.");
        } catch (error) {
            this.status(String(error));
        }
    }

    private showOverview(): void {
        this.querySelector("[data-overview]")!.removeAttribute("hidden");
        this.querySelector("[data-editor]")!.setAttribute("hidden", "");
        this.querySelector("[data-collection]")!.setAttribute("hidden", "");
    }

    private async loadExplore(): Promise<void> {
        const data = await loadDashboardExplore();
        this.catalogue = data.dashboards;
        this.collectionRevision = data.revision;
        const list = this.querySelector("[data-list]")!;
        list.replaceChildren(...data.dashboards.map((item, index) => this.exploreCard(item, index)));
        this.querySelector("[data-empty]")!.toggleAttribute("hidden", data.dashboards.length > 0);
        this.querySelector("[data-repository-warning]")!.textContent = data.unavailableRepositories.length
            ? `Unavailable repositories: ${data.unavailableRepositories.join(", ")}`
            : "";
    }

    private exploreCard(item: ExploreDashboard, index: number): HTMLElement {
        const card = document.createElement("p9r-card");
        const title = document.createElement("h2");
        title.slot = "title";
        title.textContent = item.name;
        const detail = document.createElement("p");
        detail.slot = "description";
        detail.textContent = `${item.collectionName} · ${item.repositoryId} · v${item.version} · ${item.viewCount} views`;
        const description = document.createElement("p");
        description.textContent = item.description;
        const action = document.createElement("p9r-button") as HTMLElement & { disabled: boolean };
        action.slot = "actions";
        action.dataset.exploreKey = String(index);
        action.textContent = item.installed
            ? "Manage"
            : item.installedVersion
              ? "Update collection"
              : "Install collection";
        card.append(title, detail, description, action);
        return card;
    }

    private async onExploreClick(event: Event): Promise<void> {
        const button = (event.target as Element).closest<HTMLElement>("[data-explore-key]") as
            | (HTMLElement & { disabled: boolean })
            | null;
        const item = button && this.catalogue[Number(button.dataset.exploreKey)];
        if (!button || !item) {
            return;
        }
        const installedDashboard = () =>
            this.dashboards.find(
                (dashboard) =>
                    dashboard.origin?.publisherId === item.publisherId &&
                    dashboard.origin.collectionId === item.collectionId &&
                    dashboard.origin.dashboardId === item.dashboardId,
            );
        if (item.installed) {
            const dashboard = installedDashboard();
            if (dashboard) {
                this.select(dashboard.id);
            }
            return;
        }
        button.disabled = true;
        this.status("Installing collection…");
        try {
            await installDashboardCollection(item, this.collectionRevision);
            await this.load();
            const dashboard = installedDashboard();
            if (dashboard) {
                this.select(dashboard.id);
            }
            this.status("Collection installed. The dashboard starts inactive.");
        } catch (error) {
            button.disabled = false;
            this.status(String(error));
        }
    }

    private async create(): Promise<void> {
        try {
            const name = (this.querySelector("[data-create-name]") as HTMLElement & { value: string }).value.trim();
            const icon = (this.querySelector("[data-create-icon]") as HTMLElement & { value: string }).value;
            const saved = (await postDashboard("dashboards", { name, icon, navigation: [] })) as Dashboard;
            this.createModal().hide();
            this.selectedId = saved.id;
            await this.load();
            this.status("Dashboard created. Add views to its navigation.");
        } catch (error) {
            this.status(String(error));
        }
    }

    private editor(): DashboardNavigationEditor {
        return this.querySelector("cms-dashboard-navigation-editor") as DashboardNavigationEditor;
    }

    private createModal(): HTMLElement & { showModal(): void; hide(): void } {
        return this.querySelector("[data-create-modal]") as HTMLElement & { showModal(): void; hide(): void };
    }

    private deleteModal(): HTMLElement & { showModal(): void; hide(): void } {
        return this.querySelector("[data-delete-modal]") as HTMLElement & { showModal(): void; hide(): void };
    }

    private async deleteDashboard(): Promise<void> {
        const record = this.dashboards.find((item) => item.id === this.selectedId);
        if (!record || record.origin) {
            return;
        }
        try {
            await deletePrivateDashboard(record.id, record.revision);
            this.deleteModal().hide();
            this.selectedId = "";
            history.replaceState(null, "", location.pathname);
            await this.load();
            this.status("Dashboard deleted.");
        } catch (error) {
            this.status(String(error));
        }
    }

    private memberPanel(): Element {
        const record = this.dashboards.find((item) => item.id === this.selectedId);
        return this.querySelector(record?.origin ? "[data-collection]" : "[data-editor]")!;
    }

    private status(message: string): void {
        this.querySelector("[data-status]")!.textContent = message;
    }

    private navigation(): DashboardNav | null {
        return document.querySelector("cms-dashboard-nav") as DashboardNav | null;
    }
}

customElements.define("cms-dashboard-workspace", DashboardWorkspace);
