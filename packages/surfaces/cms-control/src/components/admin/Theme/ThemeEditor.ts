import { Component } from "@bernouy/components/base";
import { adminSystemSettingsStore } from "../Common/SystemSettings/store";

import {
    THEME_CATEGORY_SELECTED_EVENT,
    dispatchThemeCategoryAdded,
    dispatchThemeCategoryDeleted,
    dispatchThemeSettingsRefreshed,
    type ThemeSelection,
} from "./events";
import { clickAction, handleThemeInput, resetThemeToken } from "./editor/controller/inputEvents";
import { persistTheme } from "./editor/controller/persistence";
import { ThemeEditorState } from "./editor/controller/state";
import css from "./editor/styles";
import template from "./editor/ThemeEditor.html" with { type: "text" };
import { renderThemeEditor, setThemeMessage } from "./editor/view";

export class CmsThemeEditor extends Component {
    private readonly state = new ThemeEditorState();

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
            this.state.applyLoaded((await adminSystemSettingsStore.load()).theme);
            this.render();
            setThemeMessage(this.shadowRoot, "");
        } catch (error) {
            setThemeMessage(this.shadowRoot, error instanceof Error ? error.message : "Unable to load theme", true);
        }
    }

    private render(): void {
        const viewState = this.state.viewState();
        if (viewState && this.shadowRoot) {
            this.state.mode = renderThemeEditor(this.shadowRoot, viewState);
        }
    }

    private onClick = (event: Event): void => {
        if (
            this.state.settings &&
            resetThemeToken(
                event,
                this.state.settings,
                this.state.selection,
                this.state.selectedThemeId,
                this.state.mode,
            )
        ) {
            this.render();
            return;
        }
        const action = clickAction(event);
        if (action === "theme") {
            if (this.state.createTheme()) {
                this.render();
            }
        } else if (action === "category") {
            const added = this.state.createCategory();
            if (added) {
                this.render();
                dispatchThemeCategoryAdded(added);
            }
        } else if (action === "token") {
            if (this.state.createToken()) {
                this.render();
            }
        } else if (action === "delete-category") {
            this.deleteCategory();
        } else if (action === "delete-token") {
            this.deleteToken(event);
        } else if (action === "save" || action === "activate") {
            void persistTheme(this.shadowRoot, this.state, action === "activate", () => this.refreshAfterSave());
        }
    };

    private onInput = (event: Event): void => {
        this.handleInput(event);
    };

    private onChange = (event: Event): void => {
        const target = event.target as HTMLElement & { value?: string };
        if (target.matches?.("[data-theme-switch]") && target.value) {
            this.state.selectedThemeId = target.value;
            this.render();
            return;
        }
        if (target.matches?.("[data-mode-switch]") && (target.value === "light" || target.value === "dark")) {
            if (this.state.mode !== target.value) {
                this.state.mode = target.value;
                this.render();
            }
            return;
        }
        if (target.matches?.("[data-token-type-control], [data-token-value-control], input[type='color']")) {
            this.handleInput(event);
            this.render();
        }
    };

    private onCategorySelected = (event: CustomEvent<ThemeSelection>): void => {
        if (this.state.selectCategory(event.detail)) {
            this.render();
        }
    };

    private handleInput(event: Event): void {
        if (!this.state.settings || !this.shadowRoot) {
            return;
        }
        handleThemeInput(event, {
            root: this.shadowRoot,
            settings: this.state.settings,
            selection: this.state.selection,
            selectedThemeId: this.state.selectedThemeId,
            mode: this.state.mode,
        });
    }

    private async refreshAfterSave(): Promise<void> {
        const selectedThemeId = this.state.selectedThemeId;
        adminSystemSettingsStore.invalidate();
        this.state.applyLoaded((await adminSystemSettingsStore.load()).theme);
        if (this.state.settings?.themes.some((theme) => theme.id === selectedThemeId)) {
            this.state.selectedThemeId = selectedThemeId;
        }
        this.render();
        dispatchThemeSettingsRefreshed();
    }

    private deleteCategory(): void {
        if (!window.confirm("Delete this group and all of its tokens?")) {
            return;
        }
        const removed = this.state.deleteCategory();
        if (removed) {
            this.render();
            dispatchThemeCategoryDeleted(removed);
        }
    }

    private deleteToken(event: Event): void {
        const tokenId = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-token-id]")?.dataset.tokenId;
        if (tokenId && window.confirm("Delete this token from every theme?") && this.state.deleteToken(tokenId)) {
            this.render();
        }
    }
}

if (!customElements.get("cms-theme-editor")) {
    customElements.define("cms-theme-editor", CmsThemeEditor);
}
