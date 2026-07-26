import type { ThemeSource } from "@bernouy/cms-content";

import type { ThemeSelection } from "../events";
import { isIntegrationSource } from "../ownership";
import { createCategoryIcon, createSourceIcon } from "./icons";

export function renderThemeNav(root: ShadowRoot | null, sources: ThemeSource[], selection: ThemeSelection): void {
    const menu = root?.querySelector("w13c-lateral-menu");
    if (!menu) {
        return;
    }
    menu.querySelectorAll("[data-generated]").forEach((item) => item.remove());
    for (const source of sources) {
        const sourceItem = document.createElement("w13c-lateral-menu-item");
        sourceItem.dataset.generated = "true";
        sourceItem.dataset.source = source.id;
        sourceItem.toggleAttribute("active", source.id === selection.sourceId);
        sourceItem.append(createSourceIcon(source.id), document.createTextNode(source.label));
        if (isIntegrationSource(source)) {
            const badge = document.createElement("span");
            badge.className = "integration-badge";
            badge.textContent = "Integration";
            sourceItem.append(badge);
        }
        menu.append(sourceItem);

        if (source.id !== selection.sourceId) {
            continue;
        }
        for (const category of source.categories) {
            const categoryItem = document.createElement("w13c-lateral-menu-item");
            categoryItem.classList.add("category-item");
            categoryItem.dataset.generated = "true";
            categoryItem.dataset.source = source.id;
            categoryItem.dataset.category = category.id;
            categoryItem.toggleAttribute("active", category.id === selection.categoryId);
            categoryItem.append(createCategoryIcon(), document.createTextNode(category.label));
            menu.append(categoryItem);
        }
    }
}

export function selectionFromUrl(sources: ThemeSource[]): ThemeSelection {
    const url = new URL(window.location.href);
    const sourceId = url.searchParams.get("type") ?? "";
    const categoryId = url.searchParams.get("category") ?? "";
    const explicitSource = sources.find((source) => source.id === sourceId);
    const source =
        explicitSource ??
        sources.find((item) => item.categories.some((category) => category.id === categoryId)) ??
        sources[0];
    const category = source?.categories.find((item) => item.id === categoryId) ?? source?.categories[0];
    return { sourceId: source?.id ?? "", categoryId: category?.id ?? "" };
}
