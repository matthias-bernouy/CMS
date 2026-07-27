import type {
    ThemeCategory,
    ThemeDefinition,
    ThemeMode,
    ThemeSettings,
    ThemeSource,
    ThemeTokenType,
} from "@bernouy/cms-content";

import { renderToken } from "./view";

export type ThemeTokenFilter = "all" | ThemeTokenType;

type ExplorerState = {
    settings: ThemeSettings;
    source: ThemeSource;
    category: ThemeCategory;
    theme: ThemeDefinition;
    mode: ThemeMode;
    catalogEditable: boolean;
    filter: ThemeTokenFilter;
    search: string;
};

const FILTER_LABELS: Record<ThemeTokenFilter, string> = {
    all: "All",
    color: "Colors",
    "font-family": "Typography",
    length: "Lengths",
    number: "Numbers",
    shadow: "Shadows",
    value: "CSS values",
};

export function renderTokenExplorer(root: ShadowRoot, state: ExplorerState): void {
    const categories = [state.category];
    const allTokens = categories.flatMap((category) => category.tokens);
    const availableFilters = new Set(allTokens.map((token) => token.type));
    const activeFilter = state.filter === "all" || availableFilters.has(state.filter) ? state.filter : "all";
    const filters = root.querySelector<HTMLElement>("[data-token-filters]")!;
    filters.replaceChildren(
        ...(["all", ...availableFilters] as ThemeTokenFilter[]).map((filter) => filterButton(filter, activeFilter)),
    );
    const search = root.querySelector<HTMLInputElement>("[data-token-search]")!;
    if (search.value !== state.search) {
        search.value = state.search;
    }

    const visible = categories
        .map((category) => ({
            category,
            tokens: category.tokens.filter(
                (token) =>
                    (activeFilter === "all" || token.type === activeFilter) &&
                    matchesSearch(state.source, category, token, state.search),
            ),
        }))
        .filter((entry) => entry.tokens.length > 0);
    const groups = visible.map(({ category, tokens }) => tokenGroup(category, tokens, state));
    root.querySelector<HTMLElement>("[data-groups]")!.replaceChildren(...(groups.length ? groups : [emptyResults()]));
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

function matchesSearch(
    source: ThemeSource,
    category: ThemeCategory,
    token: ThemeCategory["tokens"][number],
    search: string,
): boolean {
    const query = search.trim().toLowerCase();
    return (
        !query ||
        [source.label, category.label, token.label, token.description, token.variable, token.type]
            .join(" ")
            .toLowerCase()
            .includes(query)
    );
}

function filterButton(filter: ThemeTokenFilter, active: ThemeTokenFilter): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.tokenFilter = filter;
    button.textContent = FILTER_LABELS[filter];
    button.setAttribute("aria-pressed", String(filter === active));
    return button;
}

function emptyResults(): HTMLElement {
    const empty = document.createElement("div");
    empty.className = "empty-category";
    empty.textContent = "No token matches this search and filter.";
    return empty;
}
