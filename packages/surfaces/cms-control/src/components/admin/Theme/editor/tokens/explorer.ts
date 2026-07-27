import type { ThemeCategory, ThemeDefinition, ThemeMode, ThemeSettings } from "@bernouy/cms-content";

import { renderToken } from "./view";

type ExplorerState = {
    settings: ThemeSettings;
    category: ThemeCategory;
    theme: ThemeDefinition;
    mode: ThemeMode;
    catalogEditable: boolean;
};

export function renderTokenExplorer(root: ShadowRoot, state: ExplorerState): void {
    const groups = root.querySelector<HTMLElement>("[data-groups]");
    if (!groups) {
        return;
    }
    groups.replaceChildren(
        state.category.tokens.length > 0 ? tokenGroup(state.category.tokens, state) : emptyCategory(),
    );
}

function tokenGroup(tokens: ThemeCategory["tokens"], state: ExplorerState): HTMLElement {
    const group = document.createElement("section");
    group.className = "group";
    const list = document.createElement("div");
    list.className = "element-list";
    list.append(
        ...tokens.map((token) => renderToken(token, state.settings, state.theme, state.mode, state.catalogEditable)),
    );
    group.append(list);
    return group;
}

function emptyCategory(): HTMLElement {
    const empty = document.createElement("div");
    empty.className = "empty-category";
    empty.textContent = "This group does not declare any token yet.";
    return empty;
}
