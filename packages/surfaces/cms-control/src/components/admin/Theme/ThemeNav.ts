import { Component } from "@bernouy/components/base";
import type { ThemeSource } from "@bernouy/cms-content";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

import {
    THEME_CATEGORY_ADDED_EVENT,
    THEME_CATEGORY_DELETED_EVENT,
    THEME_CATEGORY_UPDATED_EVENT,
    THEME_SETTINGS_CHANGED_EVENT,
    dispatchThemeCategorySelected,
    type ThemeCategoryAdded,
    type ThemeCategoryDeleted,
    type ThemeSelection,
} from "./events";
import css from "./nav/ThemeNav.css" with { type: "text" };
import template from "./nav/ThemeNav.html" with { type: "text" };
import { renderThemeNav, selectionFromUrl } from "./nav/view";

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
        window.addEventListener(THEME_CATEGORY_DELETED_EVENT, this.onCategoryDeleted as EventListener);
        window.addEventListener(THEME_CATEGORY_UPDATED_EVENT, this.onCategoryUpdated as EventListener);
        window.addEventListener(THEME_SETTINGS_CHANGED_EVENT, this.onSettingsChanged);
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        window.removeEventListener("popstate", this.onPopState);
        window.removeEventListener(THEME_CATEGORY_ADDED_EVENT, this.onCategoryAdded as EventListener);
        window.removeEventListener(THEME_CATEGORY_DELETED_EVENT, this.onCategoryDeleted as EventListener);
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
            this.selection = selectionFromUrl(this.sources);
            this.render();
        } catch {
            // The editor displays the actionable load error; navigation stays empty.
        }
    }

    private render(): void {
        renderThemeNav(this.shadowRoot, this.sources, this.selection);
    }

    private select(sourceId: string, categoryId?: string): void {
        const source = this.sources.find((item) => item.id === sourceId);
        const category = source?.categories.find((item) => item.id === categoryId) ?? source?.categories[0];
        if (!source || !category) {
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
        this.selection = selectionFromUrl(this.sources);
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
        if (current && category) {
            current.label = category.label;
            current.description = category.description;
            this.render();
        }
    };

    private onCategoryDeleted = (event: CustomEvent<ThemeCategoryDeleted>): void => {
        const detail = event.detail;
        const source = this.sources.find((item) => item.id === detail?.sourceId);
        if (!source || !detail) {
            return;
        }
        source.categories = source.categories.filter((category) => category.id !== detail.categoryId);
        if (detail.sourceRemoved) {
            this.sources = this.sources.filter((item) => item.id !== detail.sourceId);
        }
        this.select(detail.selection.sourceId, detail.selection.categoryId);
    };

    private onSettingsChanged = (): void => {
        void this.load();
    };
}

if (!customElements.get("cms-theme-nav")) {
    customElements.define("cms-theme-nav", CmsThemeNav);
}
