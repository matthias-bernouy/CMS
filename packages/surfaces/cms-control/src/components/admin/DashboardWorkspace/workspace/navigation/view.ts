import type { DashboardDefinition, DashboardViewDefinition, DashboardViewMount } from "@bernouy/cms-dashboards";
import { renderIcon } from "../../../Resources/Dashboards/navigation/icons";
import { DASHBOARD_ICONS } from "../../../Resources/Dashboards/navigation/icons/catalog";
import { suggestedMount } from "./data";
import { readonlyNavigation } from "./readonly";

type ValueControl = HTMLElement & { value: string };

export function appendIconOptions(select: ValueControl, selected = ""): void {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select an icon";
    placeholder.disabled = true;
    placeholder.selected = !selected;
    select.replaceChildren(
        placeholder,
        ...Object.keys(DASHBOARD_ICONS).map((icon) => {
            const option = document.createElement("option");
            option.value = icon;
            option.textContent = icon.replaceAll("-", " ");
            option.selected = icon === selected;
            return option;
        }),
    );
    select.setAttribute("value", selected);
    select.value = selected;
}

export function navigationEditor(dashboard: DashboardDefinition, views: DashboardViewDefinition[]): HTMLElement {
    const section = document.createElement("cms-detail-section");
    section.setAttribute("heading", "Navigation");
    const add = document.createElement("p9r-button");
    add.slot = "actions";
    add.setAttribute("type", "button");
    add.setAttribute("variant", "outlined");
    add.dataset.navigationAction = "add-root";
    add.textContent = "+ New item";
    const tree = document.createElement("ol");
    tree.className = "dashboard-navigation-list";
    tree.dataset.navigationTree = "true";
    tree.setAttribute("aria-label", "Dashboard navigation");
    dashboard.views.forEach((mount) => tree.append(navigationNode(mount, views, 1)));
    section.append(add, tree);
    return section;
}

export function newNavigationNode(views: DashboardViewDefinition[], depth: number): HTMLElement {
    const view = views[0];
    const mount = view ? suggestedMount(view) : { id: "new-item", label: "New item", icon: "layout" };
    return navigationNode(mount, views, depth);
}

export function syncNavigationNode(node: HTMLElement, views: DashboardViewDefinition[]): void {
    const type = node.dataset.navigationKind === "group" ? "group" : "view";
    const view = type === "view" ? views.find((candidate) => candidate.id === node.dataset.navigationUse) : undefined;
    const label = node.dataset.navigationLabel || view?.meta.name || "Navigation item";
    const iconName = node.dataset.navigationIcon || view?.meta.icon || "layout";
    node.querySelector<HTMLElement>("[data-navigation-title]")!.textContent = label;
    node.querySelector<HTMLElement>("[data-navigation-subtitle]")!.textContent = view
        ? `${view.meta.name} · ${view.source}`
        : "Group";
    renderIcon(node.querySelector<HTMLElement>("[data-navigation-row-icon]")!, undefined, iconName, "layout");
    node.querySelector<HTMLElement>(".dashboard-navigation-row")!.setAttribute("aria-label", `Edit ${label}`);
}

export function syncNavigationDepth(node: HTMLElement, depth: number): void {
    node.dataset.depth = String(depth);
    const actions = node.querySelector<HTMLElement>(".dashboard-navigation-row-actions")!;
    const addChild = actions.querySelector<HTMLElement>("[data-navigation-action='add-child']");
    if (depth === 3) {
        addChild?.remove();
    } else if (!addChild) {
        const settings = actions.querySelector<HTMLElement>("[data-action='edit-navigation-item']");
        actions.insertBefore(iconButton("add-child", "Add child", "+"), settings);
    }
    directChildren(node).forEach((child) => syncNavigationDepth(child, depth + 1));
}

export { readonlyNavigation };

function navigationNode(mount: DashboardViewMount, views: DashboardViewDefinition[], depth: number): HTMLElement {
    const view = views.find((candidate) => candidate.id === mount.use);
    const node = document.createElement("li");
    node.className = "dashboard-navigation-node";
    node.dataset.navigationNode = "true";
    node.dataset.nodeId = mount.id;
    node.dataset.depth = String(depth);
    node.dataset.navigationLabel = mount.label ?? view?.meta.name ?? view?.view.label ?? "Navigation item";
    node.dataset.navigationIcon = mount.icon ?? view?.meta.icon ?? view?.view.icon ?? "layout";
    node.dataset.navigationUse = mount.use ?? "";
    node.dataset.navigationKind = mount.use ? "view" : "group";
    node.dataset.suggestedLabel = view?.meta.name ?? view?.view.label ?? "Navigation item";
    node.dataset.suggestedIcon = view?.meta.icon ?? view?.view.icon ?? "layout";
    node.append(navigationRow(depth), childrenList());
    mount.children?.forEach((child) =>
        node.querySelector<HTMLElement>("[data-navigation-children]")!.append(navigationNode(child, views, depth + 1)),
    );
    syncNavigationNode(node, views);
    return node;
}

function navigationRow(depth: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "dashboard-navigation-row";
    row.dataset.action = "edit-navigation-item";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    const handle = document.createElement("span");
    handle.className = "dashboard-navigation-handle";
    handle.dataset.navigationDragHandle = "true";
    handle.draggable = true;
    handle.tabIndex = 0;
    handle.setAttribute("role", "button");
    handle.setAttribute("aria-label", "Drag to move this item");
    handle.setAttribute("title", "Drag vertically to reorder, or move right to nest");
    handle.textContent = "⠿";
    const icon = document.createElement("span");
    icon.className = "dashboard-navigation-icon";
    icon.dataset.navigationRowIcon = "true";
    const copy = document.createElement("span");
    copy.className = "dashboard-navigation-copy";
    const title = document.createElement("strong");
    title.dataset.navigationTitle = "true";
    const subtitle = document.createElement("span");
    subtitle.dataset.navigationSubtitle = "true";
    copy.append(title, subtitle);
    row.append(handle, icon, copy, rowActions(depth));
    return row;
}

function rowActions(depth: number): HTMLElement {
    const actions = document.createElement("span");
    actions.className = "dashboard-navigation-row-actions";
    if (depth < 3) {
        actions.append(iconButton("add-child", "Add child", "+"));
    }
    const settings = iconButton("settings", "Open settings");
    settings.dataset.action = "edit-navigation-item";
    delete settings.dataset.navigationAction;
    settings.classList.add("dashboard-navigation-settings");
    renderIcon(settings, undefined, "settings", "settings");
    actions.append(settings);
    return actions;
}

function iconButton(action: string, label: string, content = ""): HTMLElement {
    const button = document.createElement("p9r-icon-button");
    button.setAttribute("type", "button");
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.dataset.navigationAction = action;
    button.textContent = content;
    return button;
}

function childrenList(): HTMLOListElement {
    const list = document.createElement("ol");
    list.className = "dashboard-navigation-list dashboard-navigation-children";
    list.dataset.navigationChildren = "true";
    return list;
}

function directChildren(node: HTMLElement): HTMLElement[] {
    const list = node.querySelector<HTMLElement>(":scope > [data-navigation-children]");
    return Array.from(list?.children ?? []).filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.matches("[data-navigation-node]"),
    );
}
