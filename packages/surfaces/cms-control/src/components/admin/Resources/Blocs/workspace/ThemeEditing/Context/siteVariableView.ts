import type { ThemeSettings } from "@bernouy/cms-content";
import { isThemeCatalogEditable } from "cms-control/components/admin/Theme/ownership";

export function renderSiteVariableCatalog(root: HTMLElement, settings: ThemeSettings): void {
    const sources = settings.sources.filter(isThemeCatalogEditable);
    const categoryCount = sources.reduce((count, source) => count + source.categories.length, 0);
    root.replaceChildren(
        ...sources.flatMap((source) => source.categories.map((category) => group(source.id, category, categoryCount))),
    );
    const add = action("New group", "create-group", sources[0]?.id ?? "", sources[0]?.categories[0]?.id ?? "");
    add.setAttribute("color", "primary");
    root.append(add);
}

function group(
    sourceId: string,
    category: ThemeSettings["sources"][number]["categories"][number],
    categoryCount: number,
): HTMLElement {
    const section = document.createElement("section");
    section.className = "site-variable-group";
    const header = document.createElement("header");
    const copy = document.createElement("div");
    const title = document.createElement("h3");
    const description = document.createElement("p");
    title.textContent = category.label;
    description.textContent = category.description;
    copy.append(title, description);
    const actions = document.createElement("div");
    actions.append(
        action("Add variable", "create-token", sourceId, category.id),
        action("Edit group", "edit-group", sourceId, category.id),
        action("Delete group", "remove-group", sourceId, category.id, categoryCount <= 1, "danger"),
    );
    header.append(copy, actions);
    section.append(header);
    if (category.tokens.length === 0) {
        const empty = document.createElement("p");
        empty.className = "site-variable-empty";
        empty.textContent = "No variables in this group.";
        section.append(empty);
    } else {
        const list = document.createElement("div");
        list.className = "site-variable-list";
        for (const token of category.tokens) {
            const row = document.createElement("div");
            const details = document.createElement("div");
            const label = document.createElement("strong");
            const description = document.createElement("span");
            label.textContent = token.label;
            description.textContent = token.description;
            details.append(label, description);
            const rowActions = document.createElement("div");
            rowActions.append(
                action("Edit", "edit-token", sourceId, category.id, false, undefined, token.id),
                action("Delete", "remove-token", sourceId, category.id, false, "danger", token.id),
            );
            row.append(details, rowActions);
            list.append(row);
        }
        section.append(list);
    }
    return section;
}

function action(
    label: string,
    actionName: string,
    sourceId: string,
    categoryId: string,
    disabled = false,
    color?: string,
    tokenId?: string,
): HTMLElement {
    const button = document.createElement("p9r-button");
    button.setAttribute("type", "button");
    button.setAttribute("variant", "ghost");
    button.toggleAttribute("disabled", disabled);
    button.dataset.siteVariableAction = actionName;
    button.dataset.sourceId = sourceId;
    button.dataset.categoryId = categoryId;
    if (tokenId) {
        button.dataset.tokenId = tokenId;
    }
    if (color) {
        button.setAttribute("color", color);
    }
    button.textContent = label;
    return button;
}
