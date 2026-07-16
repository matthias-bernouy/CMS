import { Component } from "@bernouy/components/base";
import type { ThemeCategory, ThemeDefinition, ThemeSettings, ThemeSource, ThemeToken } from "@bernouy/cms-content";
import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";

import {
    THEME_CATEGORY_SELECTED_EVENT,
    dispatchThemeCategoryAdded,
    dispatchThemeCategoryUpdated,
    dispatchThemeSettingsChanged,
    type ThemeSelection,
} from "./events";
import css from "./ThemeEditor.css" with { type: "text" };
import template from "./ThemeEditor.html" with { type: "text" };

type SettingsResponse = { site?: { name?: string; theme?: string }; theme?: ThemeSettings };

export class CmsThemeEditor extends Component {
    private selection: ThemeSelection = { sourceId: "", categoryId: "" };
    private mode: "light" | "dark" = "light";
    private settings: ThemeSettings | null = null;
    private selectedThemeId = "";
    private siteName = "";
    private canPersist = true;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.shadowRoot?.addEventListener("click", this.onClick);
        this.shadowRoot?.addEventListener("change", this.onChange);
        this.shadowRoot?.addEventListener("input", this.onInput);
        window.addEventListener(THEME_CATEGORY_SELECTED_EVENT, this.onCategorySelected as EventListener);
        void this.load();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener("change", this.onChange);
        this.shadowRoot?.removeEventListener("input", this.onInput);
        window.removeEventListener(THEME_CATEGORY_SELECTED_EVENT, this.onCategorySelected as EventListener);
    }

    private async load(): Promise<void> {
        this.setMessage("Loading theme…");
        try {
            const response = await fetch(`${getMetaBasePath()}/api/system/settings`, { headers: { Accept: "application/json" } });
            if (!response.ok) throw new Error(`Request failed (${response.status})`);
            const data = await response.json() as SettingsResponse;
            this.canPersist = Boolean(data.theme);
            this.settings = structuredClone(data.theme ?? themeSettingsFromCss(data.site?.theme ?? ""));
            this.siteName = data.site?.name ?? "";
            this.selectedThemeId = this.settings.activeThemeId || this.settings.themes[0]?.id || "";
            this.selection = this.selectionFromUrl();
            this.render();
            this.setMessage(this.canPersist ? "" : "Restart the Control server to enable theme persistence.", !this.canPersist);
            dispatchThemeSettingsChanged();
        } catch (error) {
            this.setMessage(error instanceof Error ? error.message : "Unable to load theme", true);
        }
    }

    private render(): void {
        const settings = this.settings;
        const source = this.currentSource();
        const category = this.currentCategory();
        const theme = this.currentTheme();
        if (!settings || !source || !category || !theme) return;

        this.query<HTMLElement>("[data-category-title]").textContent = category.label;
        this.query<HTMLElement>("[data-category-description]").textContent = `${source.label} · ${category.description}`;
        this.query<HTMLInputElement>("[data-theme-name-input]").value = theme.name;
        this.query<HTMLInputElement>("[data-category-label-input]").value = category.label;
        this.query<HTMLTextAreaElement>("[data-category-description-input]").value = category.description;
        this.query<HTMLElement>("[data-site-name]").textContent = this.siteName
            ? `Editing the appearance of ${this.siteName}.`
            : "Editing the appearance of this site.";

        const select = this.query<HTMLElement>("[data-theme-switch]") as HTMLElement & { value: string };
        select.replaceChildren(...settings.themes.map((item) => {
            const option = document.createElement("option");
            option.value = item.id;
            option.textContent = item.name;
            return option;
        }));
        select.value = theme.id;

        const active = theme.id === settings.activeThemeId;
        const status = this.query<HTMLElement>("[data-theme-status]");
        status.textContent = active ? "Active" : "Draft";
        status.setAttribute("color", active ? "success" : "warning");
        this.query<HTMLElement>("[data-save-theme]").toggleAttribute("disabled", !this.canPersist);
        this.query<HTMLElement>("[data-activate-theme]").toggleAttribute("disabled", active || !this.canPersist);

        const modeSwitch = this.query<HTMLElement>("[data-mode-switch]");
        modeSwitch.hidden = !source.supportsModes;
        if (!source.supportsModes) this.mode = "light";
        for (const button of Array.from(modeSwitch.querySelectorAll<HTMLButtonElement>("[data-mode]"))) {
            button.setAttribute("aria-pressed", String(button.dataset.mode === this.mode));
        }

        const section = this.query<HTMLElement>("[data-category-section]");
        section.setAttribute("heading", category.label);
        section.setAttribute("description", category.description);
        const list = document.createElement("div");
        list.className = "element-list";
        category.tokens.forEach((token) => list.append(this.renderToken(token, theme)));
        const groups = this.query<HTMLElement>("[data-groups]");
        groups.replaceChildren(category.tokens.length ? list : this.emptyCategory());
    }

    private renderToken(token: ThemeToken, theme: ThemeDefinition): HTMLElement {
        const row = document.createElement("div");
        row.className = "element-row";
        row.dataset.tokenId = token.id;
        const label = document.createElement("div");
        label.className = "element-label";
        const name = document.createElement("input");
        name.className = "token-label-input";
        name.type = "text";
        name.value = token.label;
        name.ariaLabel = `Label for --${token.variable}`;
        name.dataset.tokenLabel = "true";
        const detail = document.createElement("span");
        detail.textContent = `${token.description} · var(--${token.variable})`;
        label.append(name, detail);
        row.append(label, this.renderControl(token, theme.values[this.mode]?.[token.id] ?? ""));
        return row;
    }

    private renderControl(token: ThemeToken, value: string): HTMLElement {
        if (token.type === "color") {
            const control = document.createElement("div");
            control.className = "color-control";
            const picker = document.createElement("input");
            picker.type = "color";
            picker.value = validHex(value) ? value : "#000000";
            picker.dataset.valueControl = "true";
            const input = this.valueInput(value);
            control.append(picker, input);
            return control;
        }
        return this.valueInput(value);
    }

    private valueInput(value: string): HTMLInputElement {
        const input = document.createElement("input");
        input.className = "value-control";
        input.type = "text";
        input.value = value;
        input.dataset.valueControl = "true";
        return input;
    }

    private currentSource(): ThemeSource | undefined {
        return this.settings?.sources.find((item) => item.id === this.selection.sourceId) ?? this.settings?.sources[0];
    }

    private currentCategory(): ThemeCategory | undefined {
        const source = this.currentSource();
        return source?.categories.find((item) => item.id === this.selection.categoryId) ?? source?.categories[0];
    }

    private currentTheme(): ThemeDefinition | undefined {
        return this.settings?.themes.find((item) => item.id === this.selectedThemeId) ?? this.settings?.themes[0];
    }

    private selectionFromUrl(): ThemeSelection {
        const sources = this.settings?.sources ?? [];
        const url = new URL(window.location.href);
        const sourceId = url.searchParams.get("type") ?? "";
        const categoryId = url.searchParams.get("category") ?? "";
        const source = sources.find((item) => item.id === sourceId)
            ?? sources.find((item) => item.categories.some((category) => category.id === categoryId))
            ?? sources[0];
        const category = source?.categories.find((item) => item.id === categoryId) ?? source?.categories[0];
        return { sourceId: source?.id ?? "", categoryId: category?.id ?? "" };
    }

    private addTheme(): void {
        if (!this.settings) return;
        const number = this.settings.themes.length + 1;
        const id = uniqueId(`theme-${number}`, new Set(this.settings.themes.map((item) => item.id)));
        this.settings.themes.push({ id, name: `New theme ${number}`, values: { light: {}, dark: {} } });
        this.selectedThemeId = id;
        this.render();
    }

    private addCategory(): void {
        const source = this.currentSource();
        if (!source) return;
        const number = source.categories.length + 1;
        const id = uniqueId(`${source.id}-category-${number}`, new Set(source.categories.map((item) => item.id)));
        const category: ThemeCategory = { id, label: `New category ${number}`, description: `Custom ${source.label} tokens.`, tokens: [] };
        source.categories.push(category);
        this.selection = { sourceId: source.id, categoryId: category.id };
        this.render();
        dispatchThemeCategoryAdded({ sourceId: source.id, category });
    }

    private addToken(): void {
        const settings = this.settings;
        const source = this.currentSource();
        const category = this.currentCategory();
        if (!settings || !source || !category) return;
        const allIds = new Set(settings.sources.flatMap((item) => item.categories.flatMap((entry) => entry.tokens.map((token) => token.id))));
        const number = allIds.size + 1;
        const id = uniqueId(`custom-${number}`, allIds);
        category.tokens.push({ id, variable: id, label: `New token ${number}`, description: "Custom design token", type: source.supportsModes ? "color" : "value" });
        this.render();
    }

    private async save(activate: boolean): Promise<void> {
        if (!this.settings || !this.canPersist) return;
        if (activate) this.settings.activeThemeId = this.selectedThemeId;
        this.setMessage("Saving…");
        try {
            const response = await fetch(`${getMetaBasePath()}/api/system/settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Accept: "application/json" },
                body: JSON.stringify({ theme: this.settings }),
            });
            if (!response.ok) throw new Error((await response.text()) || `Request failed (${response.status})`);
            this.setMessage(activate ? "Theme activated." : "Theme saved.");
            this.render();
            dispatchThemeSettingsChanged();
        } catch (error) {
            this.setMessage(error instanceof Error ? error.message : "Unable to save theme", true);
        }
    }

    private setMessage(message: string, error = false): void {
        const element = this.shadowRoot?.querySelector<HTMLElement>("[data-message]");
        if (!element) return;
        element.textContent = message;
        element.toggleAttribute("data-error", error);
    }

    private emptyCategory(): HTMLElement {
        const empty = document.createElement("div");
        empty.className = "empty-category";
        empty.textContent = "This category is ready for its first token.";
        return empty;
    }

    private onClick = (event: Event): void => {
        const target = event.target as HTMLElement | null;
        if (target?.closest("[data-add-theme]")) this.addTheme();
        if (target?.closest("[data-add-theme-category]")) this.addCategory();
        if (target?.closest("[data-add-element]")) this.addToken();
        if (target?.closest("[data-save-theme]")) void this.save(false);
        if (target?.closest("[data-activate-theme]")) void this.save(true);
        const mode = target?.closest<HTMLButtonElement>("[data-mode]")?.dataset.mode;
        if (mode === "light" || mode === "dark") {
            this.mode = mode;
            this.render();
        }
    };

    private onInput = (event: Event): void => {
        const input = event.target as HTMLInputElement | null;
        const theme = this.currentTheme();
        if (!input || !theme) return;
        if (input.matches("[data-theme-name-input]")) {
            theme.name = input.value;
            return;
        }
        const category = this.currentCategory();
        const source = this.currentSource();
        if (input.matches("[data-category-label-input]") && category && source) {
            category.label = input.value;
            this.query<HTMLElement>("[data-category-title]").textContent = category.label;
            this.query<HTMLElement>("[data-category-section]").setAttribute("heading", category.label);
            dispatchThemeCategoryUpdated({ sourceId: source.id, category });
            return;
        }
        if (input.matches("[data-category-description-input]") && category && source) {
            category.description = input.value;
            this.query<HTMLElement>("[data-category-section]").setAttribute("description", category.description);
            this.query<HTMLElement>("[data-category-description]").textContent = `${source.label} · ${category.description}`;
            dispatchThemeCategoryUpdated({ sourceId: source.id, category });
            return;
        }
        if (input.matches("[data-token-label]")) {
            const tokenId = input.closest<HTMLElement>("[data-token-id]")?.dataset.tokenId;
            const token = category?.tokens.find((item) => item.id === tokenId);
            if (token) token.label = input.value;
            return;
        }
        if (!input.matches("[data-value-control]")) return;
        const tokenId = input.closest<HTMLElement>("[data-token-id]")?.dataset.tokenId;
        if (!tokenId) return;
        theme.values[this.mode] ??= {};
        theme.values[this.mode][tokenId] = input.value;
        if (input.type === "color") {
            const text = input.closest<HTMLElement>("[data-token-id]")?.querySelector<HTMLInputElement>('input[type="text"]');
            if (text) text.value = input.value;
        }
    };

    private onChange = (event: Event): void => {
        const target = event.target as HTMLElement & { value?: string };
        if (!target.matches?.("[data-theme-switch]") || !target.value) return;
        this.selectedThemeId = target.value;
        this.render();
    };

    private onCategorySelected = (event: CustomEvent<ThemeSelection>): void => {
        const source = this.settings?.sources.find((item) => item.id === event.detail?.sourceId);
        if (!source?.categories.some((category) => category.id === event.detail.categoryId)) return;
        this.selection = event.detail;
        this.render();
    };

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector(selector) as T;
    }
}

if (!customElements.get("cms-theme-editor")) customElements.define("cms-theme-editor", CmsThemeEditor);

function validHex(value: string): boolean {
    return /^#[0-9a-f]{6}$/i.test(value);
}

function uniqueId(base: string, existing: Set<string>): string {
    let value = base;
    let suffix = 2;
    while (existing.has(value)) value = `${base}-${suffix++}`;
    return value;
}

function themeSettingsFromCss(css: string): ThemeSettings {
    const values: Record<string, string> = {};
    const tokens: ThemeToken[] = [];
    const seen = new Set<string>();
    for (const match of css.matchAll(/--([a-z][a-z0-9-]*)\s*:\s*([^;{}]+)\s*;/gi)) {
        const variable = match[1]!.toLowerCase();
        if (seen.has(variable)) continue;
        seen.add(variable);
        const value = match[2]!.trim();
        tokens.push({
            id: variable,
            variable,
            label: variable.split("-").map(capitalize).join(" "),
            description: `Existing --${variable} variable`,
            type: looksLikeColor(value) ? "color" : "value",
        });
        values[variable] = value;
    }
    return {
        activeThemeId: "imported",
        sources: [{
            id: "other",
            label: "Other",
            supportsModes: false,
            categories: [{
                id: "general",
                label: "General",
                description: "Variables inferred from the current free-form stylesheet.",
                tokens,
            }],
        }],
        themes: [{
            id: "imported",
            name: "Imported theme",
            values: { light: values, dark: {} },
        }],
    };
}

function capitalize(value: string): string {
    return value ? value[0]!.toUpperCase() + value.slice(1) : value;
}

function looksLikeColor(value: string): boolean {
    return /^(#|rgb\(|rgba\(|hsl\(|hsla\(|oklch\(|oklab\(|lab\(|lch\(|color\(|transparent$|currentcolor$)/i.test(value);
}
