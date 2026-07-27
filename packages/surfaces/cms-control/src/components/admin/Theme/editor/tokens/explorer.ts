import type { ThemeCategory, ThemeDefinition, ThemeMode, ThemeSettings, ThemeSource } from "@bernouy/cms-content";

import { renderToken } from "./view";

/** @deprecated Token groups are intentionally small and no longer expose local filters. */
export type ThemeTokenFilter = "all" | ThemeCategory["tokens"][number]["type"];

type ExplorerState = {
    settings: ThemeSettings;
    source: ThemeSource;
    category: ThemeCategory;
    theme: ThemeDefinition;
    mode: ThemeMode;
    catalogEditable: boolean;
    /** Kept temporarily while the outer editor drops its obsolete explorer state. */
    filter?: ThemeTokenFilter;
    /** Kept temporarily while the outer editor drops its obsolete explorer state. */
    search?: string;
};

export function renderTokenExplorer(root: ShadowRoot, state: ExplorerState): void {
    const groups = root.querySelector<HTMLElement>("[data-groups]");
    if (!groups) {
        return;
    }
    groups.replaceChildren(
        state.category.tokens.length > 0 ? tokenGroup(state.category, state.category.tokens, state) : emptyCategory(),
    );
}

function tokenGroup(category: ThemeCategory, tokens: ThemeCategory["tokens"], state: ExplorerState): HTMLElement {
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
