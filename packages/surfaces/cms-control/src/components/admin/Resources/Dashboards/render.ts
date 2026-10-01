import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { Dashboard, User } from "./domain/types";

export function renderMemberDashboardList(root: HTMLElement, dashboards: Dashboard[]): void {
    const list = root.querySelector("[data-list]")!;
    const available = dashboards.filter((item) => item.mounts.length > 0);
    list.replaceChildren(
        ...available.map((item) => {
            const card = document.createElement("p9r-card");
            const link = document.createElement("a");
            link.slot = "actions";
            const first = item.mounts[0]!;
            link.href = `${getMetaBasePath()}/admin/dashboards/view?dashboardId=${encodeURIComponent(item.id)}&viewId=${encodeURIComponent(`${first.collectionId}:${first.viewId}`)}`;
            link.textContent = "Open dashboard";
            const title = document.createElement("h2");
            title.slot = "title";
            title.textContent = item.name;
            const detail = document.createElement("p");
            detail.slot = "description";
            detail.textContent = `${item.mounts.length} views`;
            card.append(title, detail, link);
            return card;
        }),
    );
    root.querySelector("[data-empty]")!.toggleAttribute("hidden", available.length > 0);
}

export function renderCollectionMounts(root: HTMLElement, dashboard: Dashboard): void {
    root.querySelector("[data-collection-views]")!.replaceChildren(
        ...dashboard.mounts.map((mount) => {
            const item = document.createElement("li");
            const link = document.createElement("a");
            link.href = `${getMetaBasePath()}/admin/dashboards/view?dashboardId=${encodeURIComponent(dashboard.id)}&viewId=${encodeURIComponent(`${mount.collectionId}:${mount.viewId}`)}`;
            link.textContent = mount.label;
            item.append(link);
            return item;
        }),
    );
}

export function renderMembers(root: HTMLElement, users: User[], members: string[]): void {
    const select = root.querySelector("[data-user]") as HTMLElement & { value: string };
    const available = users.filter((user) => !members.includes(user.sub));
    select.replaceChildren(...available.map((user) => new Option(user.label || user.sub, user.sub)));
    (root.querySelector("[data-add-member]") as HTMLElement & { disabled: boolean }).disabled = available.length === 0;
    root.querySelector("[data-member-list]")!.replaceChildren(
        ...members.map((subjectId) => {
            const row = document.createElement("div");
            row.className = "member-row";
            const name = document.createElement("span");
            name.textContent = users.find((user) => user.sub === subjectId)?.label ?? subjectId;
            const remove = document.createElement("p9r-button");
            remove.setAttribute("type", "button");
            remove.setAttribute("variant", "outlined");
            remove.dataset.removeMember = subjectId;
            remove.textContent = "Remove";
            row.append(name, remove);
            return row;
        }),
    );
}
