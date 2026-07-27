import type { ThemeSource } from "@bernouy/cms-content";

import type { ThemeSelection } from "../events";
import { isIntegrationSource } from "../ownership";
import { createCategoryIcon, createSourceIcon } from "./icons";

const CORE_SOURCE_LABELS: Readonly<Record<string, string>> = {
    colors: "Colors",
    typography: "Typography",
    spacing: "Spacing & layout",
    shape: "Shape & effects",
};

export function renderThemeNav(root: ShadowRoot | null, sources: ThemeSource[], selection: ThemeSelection): void {
    const menu = root?.querySelector("w13c-lateral-menu");
    if (!menu) {
        return;
    }
    menu.querySelectorAll("[data-generated]").forEach((item) => item.remove());
    renderSources(
        menu,
        [...sources.filter((source) => !isIntegrationSource(source)), ...sources.filter(isIntegrationSource)],
        selection,
    );
}

function renderSources(menu: Element, sources: ThemeSource[], selection: ThemeSelection): void {
    for (const source of sources) {
        const integration = isIntegrationSource(source);
        const hasChildren = integration ? source.categories.length > 0 : source.categories.length > 1;
        const expanded = hasChildren && source.id === selection.sourceId;
        const label = sourceNavigationLabel(source);
        const sourceItem = document.createElement("w13c-lateral-menu-item");
        sourceItem.dataset.generated = "true";
        sourceItem.dataset.source = source.id;
        sourceItem.ariaLabel = label;
        sourceItem.classList.toggle("integration-item", integration);
        sourceItem.toggleAttribute("active", !hasChildren && source.id === selection.sourceId);
        if (hasChildren) {
            sourceItem.setAttribute("role", "button");
            sourceItem.setAttribute("aria-expanded", String(expanded));
        } else {
            sourceItem.setAttribute("aria-level", "1");
        }
        sourceItem.append(createSourceIcon(source.id), document.createTextNode(label));
        menu.append(sourceItem);

        if (!expanded) {
            continue;
        }
        for (const category of source.categories) {
            const categoryItem = document.createElement("w13c-lateral-menu-item");
            categoryItem.classList.add("category-item");
            categoryItem.classList.toggle("integration-category", integration);
            categoryItem.dataset.generated = "true";
            categoryItem.dataset.source = source.id;
            categoryItem.dataset.category = category.id;
            categoryItem.ariaLabel = category.label;
            categoryItem.setAttribute("aria-level", "2");
            categoryItem.toggleAttribute("active", category.id === selection.categoryId);
            categoryItem.append(createCategoryIcon(), document.createTextNode(category.label));
            menu.append(categoryItem);
        }
    }
}

export function sourceNavigationLabel(source: ThemeSource): string {
    return CORE_SOURCE_LABELS[source.id] ?? source.label;
}
