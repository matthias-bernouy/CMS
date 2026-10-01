import type { AvailableView, NavigationItem } from "../domain/types";

export function listAt(items: NavigationItem[], parentPath: number[]): NavigationItem[] | null {
    let list = items;
    for (const index of parentPath) {
        const parent = list[index];
        if (!parent) {
            return null;
        }
        parent.children ??= [];
        list = parent.children;
    }
    return list;
}

export function itemAt(items: NavigationItem[], path: number[]): NavigationItem | null {
    return listAt(items, path.slice(0, -1))?.[path.at(-1)!] ?? null;
}

export function moveItem(items: NavigationItem[], path: number[], direction: string): boolean {
    const siblings = listAt(items, path.slice(0, -1));
    const index = path.at(-1)!;
    const item = siblings?.[index];
    if (!siblings || !item) {
        return false;
    }
    if (direction === "up" || direction === "down") {
        const next = index + (direction === "up" ? -1 : 1);
        if (next < 0 || next >= siblings.length) {
            return false;
        }
        [siblings[index], siblings[next]] = [siblings[next]!, siblings[index]!];
        return true;
    }
    if (direction === "indent" && index > 0 && path.length + treeDepth(item) <= 3) {
        const previous = siblings[index - 1]!;
        if (path.length === 2 && previous.childPlacement === "lateral") {
            return false;
        }
        siblings.splice(index, 1);
        previous.children ??= [];
        previous.childPlacement ??= path.length === 1 ? "lateral" : "tabs";
        previous.children.push(item);
        return true;
    }
    if (direction === "outdent" && path.length > 1) {
        const outer = listAt(items, path.slice(0, -2));
        const parentIndex = path.at(-2)!;
        if (!outer || !outer[parentIndex]) {
            return false;
        }
        siblings.splice(index, 1);
        outer.splice(parentIndex + 1, 0, item);
        if (siblings.length === 0) {
            delete outer[parentIndex]!.children;
            delete outer[parentIndex]!.childPlacement;
        }
        return true;
    }
    return false;
}

function treeDepth(item: NavigationItem): number {
    return 1 + Math.max(0, ...(item.children ?? []).map(treeDepth));
}

export function renderTree(items: NavigationItem[], views: AvailableView[], path: number[] = []): HTMLOListElement {
    const list = document.createElement("ol");
    list.className = "navigation-tree";
    items.forEach((item, index) => {
        const current = [...path, index];
        const row = document.createElement("li");
        row.dataset.path = current.join(".");
        const bar = document.createElement("div");
        bar.className = "navigation-row";
        const icon = document.createElement("span");
        icon.className = "navigation-icon";
        icon.textContent = (item.icon ?? "layout").slice(0, 2).toUpperCase();
        const copy = document.createElement("span");
        copy.className = "navigation-copy";
        const title = document.createElement("strong");
        title.textContent = item.label;
        const detail = document.createElement("span");
        const view = views.find((candidate) => `${candidate.collectionId}:${candidate.viewId}` === item.use);
        detail.textContent = item.use ? `${view?.collectionName ?? item.use} / ${view?.name ?? item.use}` : "Group";
        copy.append(title, detail);
        const actions = document.createElement("span");
        actions.className = "navigation-actions";
        for (const [action, label, glyph, disabled] of [
            ["up", "Move up", "↑", index === 0],
            ["down", "Move down", "↓", index === items.length - 1],
            ["indent", "Nest under previous", "→", index === 0 || current.length >= 3],
            ["outdent", "Move out one level", "←", current.length === 1],
            ["add-child", "Add child", "+", current.length >= 3],
            ["edit", "Edit item", "✎", false],
            ["delete", "Delete item", "×", false],
        ] as const) {
            const button = document.createElement("button");
            button.type = "button";
            button.dataset.action = action;
            button.setAttribute("aria-label", `${label}: ${item.label}`);
            button.title = label;
            button.textContent = glyph;
            button.disabled = disabled;
            actions.append(button);
        }
        bar.append(icon, copy, actions);
        row.append(bar);
        if (item.children?.length) {
            row.append(renderTree(item.children, views, current));
        }
        list.append(row);
    });
    return list;
}
