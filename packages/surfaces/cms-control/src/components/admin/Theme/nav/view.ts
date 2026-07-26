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
        sources.filter((source) => !isIntegrationSource(source)),
        selection,
    );
    renderSourceGroup(menu, "integrations", "Integrations", sources.filter(isIntegrationSource), selection);
}

function renderSourceGroup(
    menu: Element,
    groupId: string,
    groupLabel: string,
    sources: ThemeSource[],
    selection: ThemeSelection,
): void {
    if (sources.length === 0) {
        return;
    }
    const heading = document.createElement("span");
    heading.className = "menu-section theme-group";
    heading.dataset.generated = "true";
    heading.dataset.themeGroup = groupId;
    heading.textContent = groupLabel;
    menu.append(heading);

    renderSources(menu, sources, selection);
}

function renderSources(menu: Element, sources: ThemeSource[], selection: ThemeSelection): void {
    for (const source of sources) {
        const sourceItem = document.createElement("w13c-lateral-menu-item");
        sourceItem.dataset.generated = "true";
        sourceItem.dataset.source = source.id;
        sourceItem.toggleAttribute("active", source.id === selection.sourceId);
        sourceItem.append(createSourceIcon(source.id), document.createTextNode(sourceNavigationLabel(source)));
        menu.append(sourceItem);

        if (source.id !== selection.sourceId || isIntegrationSource(source) || source.categories.length < 2) {
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

export function sourceNavigationLabel(source: ThemeSource): string {
    return CORE_SOURCE_LABELS[source.id] ?? source.label;
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
