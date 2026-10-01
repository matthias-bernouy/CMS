import type { AvailableView, NavigationItem } from "../domain/types";
import { listAt } from "./tree";

export function renderTree(items: NavigationItem[], views: AvailableView[]): HTMLOListElement {
    return renderList(items, items, views, []);
}

function renderList(
    roots: NavigationItem[],
    items: NavigationItem[],
    views: AvailableView[],
    path: number[],
): HTMLOListElement {
    const list = document.createElement("ol");
    list.className = path.length ? "navigation-tree navigation-children" : "navigation-tree";
    items.forEach((item, index) => list.append(renderItem(roots, item, views, [...path, index], index)));
    return list;
}

function renderItem(
    roots: NavigationItem[],
    item: NavigationItem,
    views: AvailableView[],
    path: number[],
    index: number,
): HTMLLIElement {
    const row = document.createElement("li");
    row.dataset.path = path.join(".");
    row.dataset.depth = String(path.length);
    const bar = document.createElement("div");
    bar.className = "navigation-row";
    const drag = document.createElement("span");
    drag.className = "navigation-drag";
    drag.draggable = true;
    drag.dataset.dragHandle = "";
    drag.setAttribute("aria-label", `Reorder ${item.label}`);
    drag.title = "Drag to reorder";
    drag.textContent = "⋮⋮";
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
    bar.append(drag, icon, copy, role, actions(item, path, index, count));
    row.append(bar);
    if (item.children?.length) {
        row.append(renderList(roots, item.children, views, path));
    }
    return row;
}

function actions(item: NavigationItem, path: number[], index: number, count: number): HTMLElement {
    const controls = document.createElement("span");
    controls.className = "navigation-actions";
    if (path.length < 3) {
        const add = document.createElement("button");
        add.type = "button";
        add.className = "navigation-add-child";
        add.dataset.action = "add-child";
        add.setAttribute("aria-label", `Add a child to ${item.label}`);
        add.title = "Add child";
        add.textContent = "+";
        controls.append(add);
    }
    const menu = document.createElement("p9r-action-menu");
    menu.setAttribute("label", "Actions");
    menu.setAttribute("align", "end");
    menu.style.setProperty("--action-menu-panel-min-width", "190px");
    const values = [
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
