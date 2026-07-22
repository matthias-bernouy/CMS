import { Component } from "@bernouy/components/base";
import type { ThemeSettings } from "@bernouy/cms-content";

import {
    THEME_CATEGORY_SELECTED_EVENT,
    dispatchThemeCategoryAdded,
    dispatchThemeSettingsChanged,
    type ThemeSelection,
} from "./events";
import { loadThemeSettings, saveThemeSettings } from "./editor/api";
import { clickAction, handleThemeInput } from "./editor/inputEvents";
import { addCategory, addTheme, addToken, selectionFromUrl } from "./editor/model";
import css from "./editor/styles";
import template from "./editor/ThemeEditor.html" with { type: "text" };
import { renderThemeEditor, setThemeMessage } from "./editor/view";

export class CmsThemeEditor extends Component {
    private selection: ThemeSelection = { sourceId: "", categoryId: "" };
    private mode: "light" | "dark" = "light";
    private settings: ThemeSettings | null = null;
    private selectedThemeId = "";
    private siteName = "";
    private canPersist = true;

    constructor() {
        super({ css, template: template as unknown as string });
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
        setThemeMessage(this.shadowRoot, "Loading theme…");
        try {
            const loaded = await loadThemeSettings();
            this.canPersist = loaded.canPersist;
            this.settings = loaded.settings;
            this.siteName = loaded.siteName;
            this.selectedThemeId = this.settings.activeThemeId || this.settings.themes[0]?.id || "";
            this.selection = selectionFromUrl(this.settings);
            this.render();
            setThemeMessage(
                this.shadowRoot,
                this.canPersist ? "" : "Restart the Control server to enable theme persistence.",
                !this.canPersist,
            );
            dispatchThemeSettingsChanged();
        } catch (error) {
            setThemeMessage(this.shadowRoot, error instanceof Error ? error.message : "Unable to load theme", true);
        }
    }

    private render(): void {
        if (!this.settings || !this.shadowRoot) {
            return;
        }
        this.mode = renderThemeEditor(this.shadowRoot, {
            settings: this.settings,
            selection: this.selection,
            selectedThemeId: this.selectedThemeId,
            mode: this.mode,
            siteName: this.siteName,
            canPersist: this.canPersist,
        });
    }

    private addTheme(): void {
        if (this.settings) {
            this.selectedThemeId = addTheme(this.settings);
            this.render();
        }
    }

    private addCategory(): void {
        if (!this.settings) {
            return;
        }
        const added = addCategory(this.settings, this.selection);
        if (added) {
            this.selection = { sourceId: added.sourceId, categoryId: added.category.id };
            this.render();
            dispatchThemeCategoryAdded(added);
        }
    }

    private addToken(): void {
        if (this.settings) {
            addToken(this.settings, this.selection);
            this.render();
        }
    }

    private async save(activate: boolean): Promise<void> {
        if (!this.settings || !this.canPersist) {
            return;
        }
        if (activate) {
            this.settings.activeThemeId = this.selectedThemeId;
        }
        setThemeMessage(this.shadowRoot, "Saving…");
        try {
            await saveThemeSettings(this.settings);
            setThemeMessage(this.shadowRoot, activate ? "Theme activated." : "Theme saved.");
            this.render();
            dispatchThemeSettingsChanged();
        } catch (error) {
            setThemeMessage(this.shadowRoot, error instanceof Error ? error.message : "Unable to save theme", true);
        }
    }

    private onClick = (event: Event): void => {
        const action = clickAction(event);
        if (action === "theme") {
            this.addTheme();
        } else if (action === "category") {
            this.addCategory();
        } else if (action === "token") {
            this.addToken();
        } else if (action === "save" || action === "activate") {
            void this.save(action === "activate");
        }
        const mode = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-mode]")?.dataset.mode;
        if (mode === "light" || mode === "dark") {
            this.mode = mode;
            this.render();
        }
    };

    private onInput = (event: Event): void => {
        if (this.settings && this.shadowRoot) {
            handleThemeInput(event, {
                root: this.shadowRoot,
                settings: this.settings,
                selection: this.selection,
                selectedThemeId: this.selectedThemeId,
                mode: this.mode,
            });
        }
    };

    private onChange = (event: Event): void => {
        const target = event.target as HTMLElement & { value?: string };
        if (target.matches?.("[data-theme-switch]") && target.value) {
            this.selectedThemeId = target.value;
            this.render();
        }
    };

    private onCategorySelected = (event: CustomEvent<ThemeSelection>): void => {
        const source = this.settings?.sources.find((item) => item.id === event.detail?.sourceId);
        if (source?.categories.some((category) => category.id === event.detail.categoryId)) {
            this.selection = event.detail;
            this.render();
        }
    };
}

if (!customElements.get("cms-theme-editor")) {
    customElements.define("cms-theme-editor", CmsThemeEditor);
}
