import {
    deletePrivateDashboard,
    installDashboardCollection,
    loadDashboardExplore,
    loadDashboards,
    postDashboard,
} from "./domain/api";
import type { AvailableView, Dashboard, ExploreDashboard, User } from "./domain/types";
import { DashboardWorkspaceView } from "./management/DashboardWorkspaceView";
import type { DashboardNav } from "./navigation/DashboardNav";
import "./management/DashboardMembers";
import "../Blocs/icons/LibraryIcon";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

class DashboardWorkspace extends HTMLElement {
    private dashboards: Dashboard[] = [];
    private views: AvailableView[] = [];
    private users: User[] = [];
    private selectedId = "";
    private catalogue: ExploreDashboard[] = [];
    private collectionRevision = 0;
    private view!: DashboardWorkspaceView;

    connectedCallback(): void {
        if (this.querySelector("[data-list]")) {
            return;
        }
        this.innerHTML = `<style>${css}</style>${template}`;
        this.view = new DashboardWorkspaceView(this);
        this.querySelector("[data-view-error]")!.addEventListener("retry", () => void this.load());
        this.selectedId = new URLSearchParams(location.search).get("dashboardId") ?? "";
        this.querySelector("[data-create-open]")!.addEventListener("click", () => this.createModal().showModal());
        this.querySelector("[data-create-form]")!.addEventListener("submit", (event) => {
            event.preventDefault();
            void this.create();
        });
        this.querySelector("[data-create-cancel]")!.addEventListener("click", () => this.createModal().hide());
        this.querySelector("[data-delete-open]")!.addEventListener("click", () => this.deleteModal().showModal());
        this.querySelector("[data-delete-cancel]")!.addEventListener("click", () => this.deleteModal().hide());
        this.querySelector("[data-delete-confirm]")!.addEventListener("click", () => void this.deleteDashboard());
        this.querySelector("[data-list]")!.addEventListener("click", (event) => void this.onExploreClick(event));
        this.querySelector("[data-explore-search]")!.addEventListener("input", () => this.renderExplore());
        this.querySelector("[data-save]")!.addEventListener("click", () => void this.save());
        this.querySelector("[data-collection-save]")!.addEventListener("click", () => void this.saveCollectionAccess());
        this.querySelector("[data-collection-copy]")!.addEventListener(
            "click",
            () => void this.copyCollectionDashboard(),
        );
        this.addEventListener("dashboard-member-change", (event) => {
            const detail = (event as CustomEvent<{ action: "assign" | "unassign"; subjectId: string }>).detail;
            void this.changeMember(detail.action, detail.subjectId);
        });
        void this.load();
    }

    private async load(): Promise<void> {
        this.view.showState("loading");
        try {
            const data = await loadDashboards();
            this.dashboards = data.dashboards;
            this.views = data.views;
            this.users = data.users;
            if (data.mode === "member") {
                this.view.setOverviewMode("member");
                this.navigation()?.render(this.dashboards, "", true);
                this.view.showMemberOverview(this.dashboards);
                this.view.showState("ready");
                this.status("");
                return;
            }
            this.view.setOverviewMode("admin");
            if (this.selectedId && !this.dashboards.some((item) => item.id === this.selectedId)) {
                this.selectedId = "";
            }
            if (this.selectedId) {
                this.select(this.selectedId);
            } else {
                this.view.showOverview();
                this.navigation()?.render(this.dashboards, "", false);
                await this.loadExplore();
            }
            this.view.showState("ready");
            this.status("");
        } catch (error) {
            this.querySelector("[data-view-error-message]")!.textContent =
                error instanceof Error ? error.message : "Dashboards could not be loaded.";
            this.view.showState("error");
        }
    }

    private select(id: string): void {
        this.selectedId = id;
        history.replaceState(null, "", `${location.pathname}?dashboardId=${encodeURIComponent(id)}`);
        this.navigation()?.render(this.dashboards, id, false);
        const record = this.dashboards.find((item) => item.id === id);
        if (!record) {
            return;
        }
        if (record?.origin?.kind === "collection") {
            this.view.showCollection(record, this.users);
            return;
        }
        this.view.showPrivate(record, this.views, this.users);
    }

    private async save(): Promise<void> {
        const current = this.dashboards.find((item) => item.id === this.selectedId);
        if (!current || current.origin) {
            return;
        }
        const validation = this.view.privateValidationMessage();
        if (validation) {
            this.status(validation);
            return;
        }
        const draft = this.view.privateDraft();
        await this.mutate(async () => {
            await postDashboard("dashboard", {
                id: current.id,
                revision: current.revision,
                ...draft,
            });
        }, "Dashboard saved.");
    }

    private async changeMember(action: "assign" | "unassign", subjectId: string): Promise<void> {
        const record = this.dashboards.find((item) => item.id === this.selectedId);
        if (!record) {
            return;
        }
        try {
            await postDashboard("dashboard-members", { dashboardId: record.id, subjectId, action });
            const members = new Set(record.members);
            if (action === "assign") {
                members.add(subjectId);
            } else {
                members.delete(subjectId);
            }
            record.members = [...members];
            if (this.selectedId === record.id) {
                this.view.updateMember(record, action, subjectId);
            }
            this.status(action === "assign" ? "Member added." : "Member removed.");
        } catch (error) {
            if (this.selectedId === record.id) {
                this.view.clearMemberPending(record, subjectId);
            }
            this.status(String(error));
        }
    }

    private async saveCollectionAccess(): Promise<void> {
        const record = this.dashboards.find((item) => item.id === this.selectedId);
        if (!record?.origin) {
            return;
        }
        await this.mutate(async () => {
            await postDashboard("dashboard", {
                id: record.id,
                revision: record.revision,
                enabled: this.view.collectionEnabled(),
            });
        }, "Dashboard access saved.");
    }

    private async copyCollectionDashboard(): Promise<void> {
        const record = this.dashboards.find((item) => item.id === this.selectedId);
        if (!record?.origin) {
            return;
        }
        await this.mutate(async () => {
            const copy = (await postDashboard("dashboards", {
                name: `${record.name.slice(0, 115)} copy`,
                icon: record.icon ?? "layout",
                navigation: record.navigation ?? [],
            })) as Dashboard;
            this.selectedId = copy.id;
        }, "Site dashboard created. It starts inactive.");
    }

    private async loadExplore(): Promise<void> {
        const data = await loadDashboardExplore();
        this.catalogue = data.dashboards;
        this.collectionRevision = data.revision;
        this.view.renderExplore(this.catalogue);
        this.view.setRepositoryWarning(data.unavailableRepositories);
    }

    private renderExplore(): void {
        this.view.renderExplore(this.catalogue);
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
        await this.mutate(async () => {
            const name = (this.querySelector("[data-create-name]") as HTMLElement & { value: string }).value.trim();
            const icon = (this.querySelector("[data-create-icon]") as HTMLElement & { value: string }).value;
            const saved = (await postDashboard("dashboards", { name, icon, navigation: [] })) as Dashboard;
            this.createModal().hide();
            this.selectedId = saved.id;
        }, "Dashboard created. Add views to its navigation.");
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
        await this.mutate(async () => {
            await deletePrivateDashboard(record.id, record.revision);
            this.deleteModal().hide();
            this.selectedId = "";
            history.replaceState(null, "", location.pathname);
        }, "Dashboard deleted.");
    }

    private async mutate(action: () => Promise<void>, success: string): Promise<void> {
        try {
            await action();
            await this.load();
            this.status(success);
        } catch (error) {
            this.status(String(error));
        }
    }

    private status(message: string): void {
        this.view.status(message);
    }

    private navigation(): DashboardNav | null {
        return document.querySelector("cms-dashboard-nav") as DashboardNav | null;
    }
}

customElements.define("cms-dashboard-workspace", DashboardWorkspace);
