import type { AvailableView, NavigationItem } from "../domain/types";
import { listAt } from "./tree";

export function renderTree(items: NavigationItem[], views: AvailableView[]): HTMLOListElement {
    const used = new Set(walk(items).flatMap((item) => (item.use ? [item.use] : [])));
    return renderList(items, items, views, used, []);
}

function renderList(
    roots: NavigationItem[],
    items: NavigationItem[],
    views: AvailableView[],
    used: ReadonlySet<string>,
    path: number[],
): HTMLOListElement {
    const list = document.createElement("ol");
    list.className = path.length ? "navigation-tree navigation-children" : "navigation-tree";
    items.forEach((item, index) => list.append(renderItem(roots, item, views, used, [...path, index], index)));
    return list;
}

function renderItem(
    roots: NavigationItem[],
    item: NavigationItem,
    views: AvailableView[],
    used: ReadonlySet<string>,
    path: number[],
    index: number,
): HTMLLIElement {
    const row = document.createElement("li");
    row.dataset.path = path.join(".");
    row.dataset.depth = String(path.length);
    const bar = document.createElement("div");
    bar.className = "navigation-row";
    const drag = document.createElement("p9r-icon-button");
    drag.setAttribute("type", "button");
    drag.setAttribute("size", "sm");
    drag.setAttribute("variant", "ghost");
    drag.className = "navigation-drag";
    drag.dataset.dragHandle = "";
    drag.setAttribute("aria-label", `Reorder ${item.label}`);
    drag.title = "Drag to reorder";
    drag.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>';
    const icon = document.createElement("span");
    icon.className = "navigation-icon";
    const glyph = document.createElement("cms-library-icon");
    glyph.setAttribute("name", item.icon ?? "layout");
    icon.append(glyph);
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "navigation-copy";
    copy.dataset.action = "edit";
    copy.setAttribute("aria-label", `Edit ${item.label}`);
    const title = document.createElement("strong");
    title.textContent = item.label;
    const detail = document.createElement("span");
    detail.textContent = itemDetail(item, views);
    copy.append(title, detail);
    const role = document.createElement("span");
    role.className = "navigation-role";
    role.textContent = roleAt(roots, path);
    const count = listAt(roots, path.slice(0, -1))?.length ?? 0;
    const canAddChild =
        canContainChildren(roots, path) && (path.length < 2 || views.some((view) => !used.has(viewKey(view))));
    bar.append(drag, icon, copy, role, actions(item, path, index, count, canAddChild));
    row.append(bar);
    if (item.children?.length) {
        row.append(renderList(roots, item.children, views, used, path));
    }
    return row;
}

function actions(
    item: NavigationItem,
    path: number[],
    index: number,
    count: number,
    canAddChild: boolean,
): HTMLElement {
    const controls = document.createElement("span");
    controls.className = "navigation-actions";
    const menu = document.createElement("p9r-action-menu");
    menu.setAttribute("label", "Actions");
    menu.setAttribute("align", "end");
    menu.style.setProperty("--action-menu-panel-min-width", "190px");
    const values = [
        ...(canAddChild ? [["add-child", "Add child", false, false] as const] : []),
        ["up", "Move up", index === 0, false],
        ["down", "Move down", index === count - 1, false],
        ["indent", "Nest under previous", index === 0 || path.length >= 3, false],
        ["outdent", "Move out one level", path.length === 1, false],
        ["delete", "Delete item", false, true],
    ] as const;
    for (const [action, label, disabled, danger] of values) {
        const menuItem = document.createElement("p9r-action-menu-item");
        menuItem.dataset.action = action;
        menuItem.textContent = label;
        menuItem.toggleAttribute("disabled", disabled);
        if (danger) {
            menuItem.setAttribute("color", "danger");
        }
        menu.append(menuItem);
    }
    controls.append(menu);
    return controls;
}

function walk(items: NavigationItem[]): NavigationItem[] {
    return items.flatMap((item) => [item, ...walk(item.children ?? [])]);
}

function viewKey(view: AvailableView): string {
    return `${view.collectionId}:${view.viewId}`;
}

function canContainChildren(roots: NavigationItem[], path: number[]): boolean {
    if (path.length === 1) {
        return true;
    }
    return path.length === 2 && roots[path[0]!]?.childPlacement !== "tabs";
}

function roleAt(roots: NavigationItem[], path: number[]): string {
    if (path.length === 1) {
        return "Primary navigation";
    }
    if (path.length === 3) {
        return "Tab";
    }
    return roots[path[0]!]!.childPlacement === "tabs" ? "Tab" : "Side navigation";
}

function itemDetail(item: NavigationItem, views: AvailableView[]): string {
    if (!item.use) {
        return item.children?.length ? "Navigation group" : "Group needs a child";
    }
    const view = views.find((candidate) => `${candidate.collectionId}:${candidate.viewId}` === item.use);
    return view ? `${view.collectionName} collection` : "Unavailable view";
}
