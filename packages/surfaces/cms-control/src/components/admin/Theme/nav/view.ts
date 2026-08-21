import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import type { ThemeCategory, ThemeSource } from "@bernouy/cms-content";

import { integrationIcon } from "../../Resources/Integrations/ui/resources";
import type { ThemeNavAction, ThemeSelection } from "../events";
import { isIntegrationSource } from "../ownership";

export type ThemeNavActionRequest = {
    action: ThemeNavAction;
    selection: ThemeSelection;
};

type RequestAction = (request: ThemeNavActionRequest) => void;

export function renderThemeNav(
    root: ShadowRoot | null,
    sources: ThemeSource[],
    selection: ThemeSelection,
    definitions: ReadonlyMap<string, IntegrationDefinition> = new Map(),
    requestAction?: RequestAction,
): void {
    const menu = root?.querySelector("w13c-lateral-menu");
    if (!menu) {
        return;
    }
    menu.querySelectorAll("[data-generated]").forEach((item) => item.remove());
    renderSources(menu, sources, selection, definitions, requestAction);
}

function renderSources(
    menu: Element,
    sources: ThemeSource[],
    selection: ThemeSelection,
    definitions: ReadonlyMap<string, IntegrationDefinition>,
    requestAction: RequestAction | undefined,
): void {
    const siteSources = sources.filter((source) => !isIntegrationSource(source));
    if (siteSources.length > 0) {
        menu.append(siteHeading());
        renderCategories(menu, siteSources, selection, true, requestAction);
        menu.append(newGroupAction(siteSources, selection, requestAction));
    }
    for (const source of sources.filter(isIntegrationSource)) {
        menu.append(integrationHeading(source, definitions.get(source.owner.integrationId)));
        renderCategories(menu, [source], selection, false, requestAction);
    }
}

function renderCategories(
    menu: Element,
    sources: ThemeSource[],
    selection: ThemeSelection,
    editable: boolean,
    requestAction: RequestAction | undefined,
): void {
    const canDelete = sources.reduce((total, source) => total + source.categories.length, 0) > 1;
    for (const source of sources) {
        for (const category of source.categories) {
            const categoryItem = document.createElement("w13c-lateral-menu-item");
            categoryItem.classList.add("category-item");
            categoryItem.classList.toggle("editable-category", editable);
            categoryItem.dataset.generated = "true";
            categoryItem.dataset.source = source.id;
            categoryItem.dataset.category = category.id;
            categoryItem.ariaLabel = category.label;
            categoryItem.setAttribute("aria-level", "1");
            categoryItem.toggleAttribute(
                "active",
                source.id === selection.sourceId && category.id === selection.categoryId,
            );
            categoryItem.append(categoryLabel(category));
            if (editable) {
                categoryItem.append(...categoryActions(source, category, canDelete, requestAction));
            }
            menu.append(categoryItem);
        }
    }
}

function categoryLabel(category: ThemeCategory): HTMLElement {
    const label = document.createElement("span");
    label.className = "theme-category-label";
    label.dataset.themeCategoryLabel = "true";
    label.textContent = category.label;
    return label;
}

function categoryActions(
    source: ThemeSource,
    category: ThemeCategory,
    canDelete: boolean,
    requestAction: RequestAction | undefined,
): HTMLElement[] {
    const selection = { sourceId: source.id, categoryId: category.id };
    const quickAction = actionButton(
        "add-variable",
        "+",
        `Add a variable to ${category.label}`,
        selection,
        requestAction,
    );
    quickAction.slot = "quick-actions";
    const menu = document.createElement("details");
    menu.className = "theme-group-actions";
    menu.slot = "more-actions";
    const summary = document.createElement("summary");
    summary.className = "theme-group-actions-trigger";
    summary.ariaLabel = `Actions for ${category.label}`;
    summary.title = "Group actions";
    summary.textContent = "⋯";
    const panel = document.createElement("span");
    panel.className = "theme-group-actions-panel";
    panel.setAttribute("role", "menu");
    panel.append(
        menuButton("edit-group", "Edit group", selection, requestAction),
        deleteGroupButton(canDelete, selection, requestAction),
    );
    menu.append(summary, panel);
    return [quickAction, menu];
}

function actionButton(
    action: ThemeNavAction,
    label: string,
    accessibleName: string,
    selection: ThemeSelection,
    requestAction: RequestAction | undefined,
): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-category-action";
    button.dataset.themeNavAction = action;
    button.ariaLabel = accessibleName;
    button.title = accessibleName;
    button.textContent = label;
    button.addEventListener("click", () => requestAction?.({ action, selection }));
    return button;
}

function menuButton(
    action: ThemeNavAction,
    label: string,
    selection: ThemeSelection,
    requestAction: RequestAction | undefined,
): HTMLButtonElement {
    const button = actionButton(action, label, label, selection, requestAction);
    button.className = "theme-group-action";
    button.setAttribute("role", "menuitem");
    return button;
}

function deleteGroupButton(
    canDelete: boolean,
    selection: ThemeSelection,
    requestAction: RequestAction | undefined,
): HTMLButtonElement {
    const button = menuButton("delete-group", "Delete group", selection, requestAction);
    button.classList.add("danger");
    button.disabled = !canDelete;
    button.title = canDelete ? "Delete group" : "Keep at least one site group.";
    return button;
}

function newGroupAction(
    sources: ThemeSource[],
    selection: ThemeSelection,
    requestAction: RequestAction | undefined,
): HTMLButtonElement {
    const source =
        sources.find((item) => item.id === selection.sourceId && item.categories.length > 0) ??
        sources.find((item) => item.categories.length > 0) ??
        sources[0]!;
    const category = source.categories.find((item) => item.id === selection.categoryId) ?? source.categories[0];
    const target = { sourceId: source.id, categoryId: category?.id ?? "" };
    const button = actionButton("create-group", "+ New group", "Create a site variable group", target, requestAction);
    button.className = "theme-new-group";
    button.dataset.generated = "true";
    button.dataset.targetSource = source.id;
    if (category) {
        button.dataset.targetCategory = category.id;
    }
    return button;
}

function siteHeading(): HTMLElement {
    const heading = document.createElement("div");
    heading.className = "menu-section theme-site-heading";
    heading.dataset.generated = "true";
    heading.dataset.themeGroup = "site";
    heading.textContent = "Site";
    return heading;
}

function integrationHeading(source: ThemeSource, definition: IntegrationDefinition | undefined): HTMLElement {
    const heading = document.createElement("div");
    heading.className = "menu-section theme-source-heading";
    heading.dataset.generated = "true";
    heading.dataset.themeGroup = source.id;
    const label = document.createElement("span");
    label.textContent = source.label;
    heading.append(integrationIcon(definition), label);
    return heading;
}
