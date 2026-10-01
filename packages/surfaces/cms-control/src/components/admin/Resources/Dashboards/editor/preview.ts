import type { AvailableView, NavigationItem } from "../domain/types";
import { itemAt } from "./tree";

export function renderPreview(items: NavigationItem[], views: AvailableView[], selectedPath: number[]): HTMLElement {
    const preview = document.createElement("div");
    preview.className = "navigation-preview";
    const heading = document.createElement("div");
    heading.className = "preview-heading";
    const title = document.createElement("strong");
    title.textContent = "Navigation preview";
    const hint = document.createElement("span");
    hint.textContent = "Click an item to inspect its path.";
    heading.append(title, hint);
    preview.append(heading);
    if (items.length === 0) {
        const empty = document.createElement("p");
        empty.className = "preview-empty";
        empty.textContent = "Add a primary item to start the dashboard navigation.";
        preview.append(empty);
        return preview;
    }
    const path = itemAt(items, selectedPath) ? selectedPath : [0];
    preview.append(navigationBar("Primary", items, [], path[0] ?? 0));
    const root = items[path[0] ?? 0]!;
    let current = root;
    if (root.children?.length) {
        if (root.childPlacement === "lateral") {
            const index = path[1] ?? 0;
            preview.append(navigationBar("Side navigation", root.children, [path[0] ?? 0], index));
            current = root.children[index] ?? root.children[0]!;
            if (current.children?.length) {
                preview.append(navigationBar("Tabs", current.children, [path[0] ?? 0, index], path[2] ?? 0));
                current = current.children[path[2] ?? 0] ?? current.children[0]!;
            }
        } else {
            preview.append(navigationBar("Tabs", root.children, [path[0] ?? 0], path[1] ?? 0));
            current = root.children[path[1] ?? 0] ?? root.children[0]!;
        }
    }
    const content = document.createElement("div");
    content.className = "preview-content";
    const view = views.find((candidate) => `${candidate.collectionId}:${candidate.viewId}` === firstUse(current));
    const marker = document.createElement("span");
    marker.textContent = "Opened view";
    const name = document.createElement("strong");
    name.textContent = view?.name ?? current.label;
    const collection = document.createElement("small");
    collection.textContent = view?.collectionName ?? "Navigation group";
    content.append(marker, name, collection);
    preview.append(content);
    return preview;
}

function navigationBar(label: string, items: NavigationItem[], parent: number[], active: number): HTMLElement {
    const section = document.createElement("div");
    section.className = "preview-navigation";
    const title = document.createElement("span");
    title.textContent = label;
    const list = document.createElement("div");
    items.forEach((item, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.previewSelect = [...parent, index].join(".");
        button.toggleAttribute("data-active", index === active);
        button.textContent = item.label;
        list.append(button);
    });
    section.append(title, list);
    return section;
}

function firstUse(item: NavigationItem): string | undefined {
    return item.use ?? item.children?.map(firstUse).find(Boolean);
}
