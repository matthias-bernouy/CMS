import { Component } from "@bernouy/components/base";
import type { ThemeSource } from "@bernouy/cms-content";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

import {
    THEME_CATEGORY_ADDED_EVENT,
    THEME_CATEGORY_UPDATED_EVENT,
    THEME_SETTINGS_CHANGED_EVENT,
    dispatchThemeCategorySelected,
    type ThemeCategoryAdded,
    type ThemeSelection,
} from "./events";
import css from "./ThemeNav.css" with { type: "text" };
import template from "./ThemeNav.html" with { type: "text" };

export class CmsThemeNav extends Component {
    private sources: ThemeSource[] = [];
    private selection: ThemeSelection = { sourceId: "", categoryId: "" };

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        void this.load();
        this.shadowRoot?.addEventListener("click", this.onClick);
        window.addEventListener("popstate", this.onPopState);
        window.addEventListener(THEME_CATEGORY_ADDED_EVENT, this.onCategoryAdded as EventListener);
        window.addEventListener(THEME_CATEGORY_UPDATED_EVENT, this.onCategoryUpdated as EventListener);
        window.addEventListener(THEME_SETTINGS_CHANGED_EVENT, this.onSettingsChanged);
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        window.removeEventListener("popstate", this.onPopState);
        window.removeEventListener(THEME_CATEGORY_ADDED_EVENT, this.onCategoryAdded as EventListener);
        window.removeEventListener(THEME_CATEGORY_UPDATED_EVENT, this.onCategoryUpdated as EventListener);
        window.removeEventListener(THEME_SETTINGS_CHANGED_EVENT, this.onSettingsChanged);
    }

    private async load(): Promise<void> {
        try {
            const response = await fetch(`${getMetaBasePath()}/api/system/settings`, {
                headers: { Accept: "application/json" },
            });
            if (!response.ok) {
                return;
            }
            const data = (await response.json()) as { theme?: { sources?: ThemeSource[] } };
            this.sources = structuredClone(data.theme?.sources ?? []);
            this.selection = this.selectionFromUrl();
            this.render();
        } catch {
            // The editor displays the actionable load error; navigation stays empty.
        }
    }

    private render(): void {
        const menu = this.shadowRoot?.querySelector("w13c-lateral-menu");
        if (!menu) {
            return;
        }
        menu.querySelectorAll("[data-generated]").forEach((item) => item.remove());

        for (const source of this.sources) {
            const sourceItem = document.createElement("w13c-lateral-menu-item");
            sourceItem.dataset.generated = "true";
            sourceItem.dataset.source = source.id;
            sourceItem.toggleAttribute("active", source.id === this.selection.sourceId);
            sourceItem.append(createSourceIcon(source.id), document.createTextNode(source.label));
            menu.append(sourceItem);

            if (source.id !== this.selection.sourceId) {
                continue;
            }
            for (const category of source.categories) {
                const categoryItem = document.createElement("w13c-lateral-menu-item");
                categoryItem.classList.add("category-item");
                categoryItem.dataset.generated = "true";
                categoryItem.dataset.source = source.id;
                categoryItem.dataset.category = category.id;
                categoryItem.toggleAttribute("active", category.id === this.selection.categoryId);
                categoryItem.append(createCategoryIcon(), document.createTextNode(category.label));
                menu.append(categoryItem);
            }
        }
    }

    private select(sourceId: string, categoryId?: string): void {
        const source = this.sources.find((item) => item.id === sourceId);
        if (!source) {
            return;
        }
        const category = source.categories.find((item) => item.id === categoryId) ?? source.categories[0];
        if (!category) {
            return;
        }
        this.selection = { sourceId: source.id, categoryId: category.id };
        const url = new URL(window.location.href);
        url.searchParams.set("type", source.id);
        url.searchParams.set("category", category.id);
        window.history.replaceState(null, "", url);
        this.render();
        dispatchThemeCategorySelected(this.selection);
    }

    private selectionFromUrl(): ThemeSelection {
        const url = new URL(window.location.href);
        const sourceId = url.searchParams.get("type") ?? "";
        const categoryId = url.searchParams.get("category") ?? "";
        const explicitSource = this.sources.find((source) => source.id === sourceId);
        const source =
            explicitSource ??
            this.sources.find((item) => item.categories.some((category) => category.id === categoryId)) ??
            this.sources[0];
        const category = source?.categories.find((item) => item.id === categoryId) ?? source?.categories[0];
        return { sourceId: source?.id ?? "", categoryId: category?.id ?? "" };
    }

    private onClick = (event: Event): void => {
        const target = event.target as Element | null;
        const category = target?.closest<HTMLElement>("[data-category]");
        if (category?.dataset.source && category.dataset.category) {
            this.select(category.dataset.source, category.dataset.category);
            return;
        }
        const source = target?.closest<HTMLElement>("[data-source]");
        if (source?.dataset.source) {
            this.select(source.dataset.source);
        }
    };

    private onPopState = (): void => {
        this.selection = this.selectionFromUrl();
        this.render();
        dispatchThemeCategorySelected(this.selection);
    };

    private onCategoryAdded = (event: CustomEvent<ThemeCategoryAdded>): void => {
        const { sourceId, category } = event.detail ?? {};
        const source = this.sources.find((item) => item.id === sourceId);
        if (!source || !category || source.categories.some((item) => item.id === category.id)) {
            return;
        }
        source.categories.push(category);
        this.select(source.id, category.id);
    };

    private onCategoryUpdated = (event: CustomEvent<ThemeCategoryAdded>): void => {
        const { sourceId, category } = event.detail ?? {};
        const current = this.sources
            .find((item) => item.id === sourceId)
            ?.categories.find((item) => item.id === category?.id);
        if (!current || !category) {
            return;
        }
        current.label = category.label;
        current.description = category.description;
        this.render();
    };

    private onSettingsChanged = (): void => {
        void this.load();
    };
}

if (!customElements.get("cms-theme-nav")) {
    customElements.define("cms-theme-nav", CmsThemeNav);
}

function createSourceIcon(sourceId: string): SVGSVGElement {
    return createIcon(sourceIconPaths(sourceId));
}

function createCategoryIcon(): SVGSVGElement {
    return createIcon('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8"/><path d="M8 13h5"/>');
}

function createIcon(paths: string): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("slot", "icon");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.innerHTML = paths;
    return svg;
}

function sourceIconPaths(sourceId: string): string {
    if (sourceId === "colors") {
        return '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7" r=".5" fill="currentColor"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.7-.13 2.45-.35 1.1-.33 1.5-1.65.9-2.65-.58-.98-1.35-1.45-1.35-2.4 0-1.1.9-2 2-2h4c1.1 0 2-.9 2-2A10 10 0 0 0 12 2Z"/>';
    }
    if (sourceId === "typography") {
        return '<path d="M4 5V3h16v2"/><path d="M12 3v18"/><path d="M8 21h8"/>';
    }
    if (sourceId === "spacing") {
        return '<path d="M4 6h16"/><path d="M4 12h10"/><path d="M4 18h16"/><path d="M17 9v6"/>';
    }
    return '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 16 16 8"/>';
}
