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
    const bar = document.createElement("div");
    bar.className = "navigation-row";
    bar.dataset.previewPath = path.join(".");
    const icon = document.createElement("span");
    icon.className = "navigation-icon";
    const glyph = document.createElement("cms-library-icon");
    glyph.setAttribute("name", item.icon ?? "layout");
    icon.append(glyph);
    const copy = document.createElement("span");
    copy.className = "navigation-copy";
    const title = document.createElement("strong");
    title.textContent = item.label;
    const detail = document.createElement("span");
    detail.textContent = itemDetail(item, views);
    copy.append(title, detail);
    const role = document.createElement("span");
    role.className = "navigation-role";
    role.textContent = roleAt(roots, path);
    const count = listAt(roots, path.slice(0, -1))?.length ?? 0;
    bar.append(icon, copy, role, actions(item, path, index, count));
    row.append(bar);
    if (item.children?.length) {
        row.append(renderList(roots, item.children, views, path));
    }
    return row;
}

function actions(item: NavigationItem, path: number[], index: number, count: number): HTMLElement {
    const controls = document.createElement("span");
    controls.className = "navigation-actions";
    const values = [
        ["up", "Move up", "↑", index === 0],
        ["down", "Move down", "↓", index === count - 1],
        ["indent", "Nest under previous", "→", index === 0 || path.length >= 3],
        ["outdent", "Move out one level", "←", path.length === 1],
        ["add-child", "Add child", "+", path.length >= 3],
        ["edit", "Edit item", "✎", false],
        ["delete", "Delete item", "×", false],
    ] as const;
    for (const [action, label, text, disabled] of values) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.action = action;
        button.setAttribute("aria-label", `${label}: ${item.label}`);
        button.title = label;
        button.textContent = text;
        button.disabled = disabled;
        controls.append(button);
    }
    return controls;
}

function roleAt(roots: NavigationItem[], path: number[]): string {
    if (path.length === 1) {
        return "Primary";
    }
    if (path.length === 3) {
        return "Tab";
    }
    return roots[path[0]!]!.childPlacement === "tabs" ? "Tab" : "Side";
}

function itemDetail(item: NavigationItem, views: AvailableView[]): string {
    if (!item.use) {
        return item.children?.length ? "Navigation group" : "Group needs a child";
    }
    const view = views.find((candidate) => `${candidate.collectionId}:${candidate.viewId}` === item.use);
    return view ? `${view.collectionName} / ${view.name}` : "Unavailable view";
}
