import type { AvailableView, Dashboard, ExploreDashboard, User } from "../domain/types";
import type { DashboardNavigationEditor } from "../editor/NavigationEditor";
import type { DashboardMembers } from "./DashboardMembers";
import { exploreDashboardCard, renderCollectionMounts, renderMemberDashboardList } from "./render";

type ValueControl = HTMLElement & { value: string };
type ToggleControl = HTMLElement & { checked: boolean };

export class DashboardWorkspaceView {
    constructor(private readonly root: HTMLElement) {
        this.root.querySelectorAll<HTMLAnchorElement>("[data-back]").forEach((link) => {
            link.href = location.pathname;
        });
    }

    showState(state: "loading" | "error" | "ready"): void {
        this.element<HTMLElement>("[data-view-loading]").hidden = state !== "loading";
        this.element<HTMLElement>("[data-view-error]").hidden = state !== "error";
        if (state !== "ready") {
            this.hide("[data-overview]");
            this.hide("[data-editor]");
            this.hide("[data-collection]");
        }
        this.root.setAttribute("aria-busy", String(state === "loading"));
    }

    setOverviewMode(mode: "admin" | "member"): void {
        const member = mode === "member";
        this.element("[data-create-open]").toggleAttribute("hidden", member);
        this.element("[data-explore-search]").toggleAttribute("hidden", member);
        this.element("[data-overview-title]").textContent = member ? "Your dashboards" : "Explore dashboards";
        this.element("[data-overview-description]").textContent = member
            ? "Open a dashboard assigned to your account."
            : "Browse dashboards offered by your repositories. Installing one also installs its collection.";
    }

    showMemberOverview(dashboards: Dashboard[]): void {
        this.showOverview();
        renderMemberDashboardList(this.root, dashboards);
    }

    showOverview(): void {
        this.show("[data-overview]");
        this.hide("[data-editor]");
        this.hide("[data-collection]");
    }

    showPrivate(record: Dashboard, views: AvailableView[], users: User[]): void {
        this.hide("[data-overview]");
        this.hide("[data-collection]");
        this.show("[data-editor]");
        this.element("[data-editor-title]").textContent = record.name;
        this.field("[data-name]").value = record.name;
        this.field("[data-icon]").value = record.icon ?? "layout";
        this.element<ToggleControl>("[data-enabled]").checked = record.enabled;
        this.editor().views = views;
        this.editor().value = record.navigation ?? [];
        this.syncOpenLink("[data-private-open]", record);
        this.members("[data-private-members]").value = { users, members: record.members };
    }

    showCollection(record: Dashboard, users: User[]): void {
        this.hide("[data-overview]");
        this.hide("[data-editor]");
        this.show("[data-collection]");
        this.element("[data-collection-name]").textContent = record.name;
        this.element("[data-collection-description]").textContent = record.description ?? "";
        this.element("[data-collection-origin]").textContent =
            `${record.collectionName} · ${record.origin!.publisherId} / ${record.origin!.collectionId}`;
        this.element<ToggleControl>("[data-collection-enabled]").checked = record.enabled;
        this.syncOpenLink("[data-collection-open]", record);
        renderCollectionMounts(this.root, record);
        this.members("[data-collection-members]").value = { users, members: record.members };
    }

    renderExplore(catalogue: ExploreDashboard[]): void {
        const query = this.field("[data-explore-search]").value.trim().toLocaleLowerCase();
        const matches = catalogue
            .map((item, index) => ({ item, index }))
            .filter(({ item }) =>
                `${item.name} ${item.collectionName} ${item.description}`.toLocaleLowerCase().includes(query),
            );
        this.element("[data-list]").replaceChildren(
            ...matches.map(({ item, index }) => exploreDashboardCard(item, index)),
        );
        this.element("[data-empty]").toggleAttribute("hidden", matches.length > 0);
        this.element("[data-empty-title]").textContent = query ? "No matching dashboards" : "No dashboards available";
        this.element("[data-empty-hint]").textContent = query
            ? "Try a different dashboard or collection name."
            : "Collection dashboards appear here after they are released to a configured repository.";
    }

    privateDraft(): { name: string; icon: string; enabled: boolean; navigation: Dashboard["navigation"] } {
        return {
            name: this.field("[data-name]").value,
            icon: this.field("[data-icon]").value,
            enabled: this.element<ToggleControl>("[data-enabled]").checked,
            navigation: this.editor().value,
        };
    }

    privateValidationMessage(): string {
        const navigation = this.editor().value;
        if (this.element<ToggleControl>("[data-enabled]").checked && navigation.length === 0) {
            return "Add a view before activating this dashboard.";
        }
        return this.editor().validationMessage();
    }

    collectionEnabled(): boolean {
        return this.element<ToggleControl>("[data-collection-enabled]").checked;
    }

    updateMember(record: Dashboard, action: "assign" | "unassign", subjectId: string): void {
        this.members(record.origin ? "[data-collection-members]" : "[data-private-members]").setAssigned(
            subjectId,
            action === "assign",
        );
    }

    clearMemberPending(record: Dashboard, subjectId: string): void {
        this.members(record.origin ? "[data-collection-members]" : "[data-private-members]").clearPending(subjectId);
    }

    setRepositoryWarning(repositories: string[]): void {
        this.element("[data-repository-warning]").textContent = repositories.length
            ? `Unavailable repositories: ${repositories.join(", ")}`
            : "";
    }

    status(message: string): void {
        this.element("[data-status]").textContent = message;
    }

    private syncOpenLink(selector: string, record: Dashboard): void {
        const first = record.mounts[0];
        const open = this.element<HTMLAnchorElement>(selector);
        open.toggleAttribute("hidden", !first);
        if (first) {
            open.href = `${location.pathname}/view?dashboardId=${encodeURIComponent(record.id)}&viewId=${encodeURIComponent(`${first.collectionId}:${first.viewId}`)}`;
        }
    }

    private members(selector: string): DashboardMembers {
        return this.element(selector) as DashboardMembers;
    }

    private editor(): DashboardNavigationEditor {
        return this.element("cms-dashboard-navigation-editor") as DashboardNavigationEditor;
    }

    private field(selector: string): ValueControl {
        return this.element(selector) as ValueControl;
    }

    private show(selector: string): void {
        this.element(selector).removeAttribute("hidden");
    }

    private hide(selector: string): void {
        this.element(selector).setAttribute("hidden", "");
    }

    private element<T extends Element = HTMLElement>(selector: string): T {
        return this.root.querySelector(selector) as T;
    }
}
