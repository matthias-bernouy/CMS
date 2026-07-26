import { Component } from "@bernouy/components/base";

import {
    THEME_CATEGORY_SELECTED_EVENT,
    dispatchThemeCategoryAdded,
    dispatchThemeCategoryDeleted,
    dispatchThemeSettingsChanged,
    type ThemeSelection,
} from "./events";
import type { ThemeExplorerContext } from "./editor/controller/explorerController";
import { clickAction, handleThemeInput, resetThemeToken } from "./editor/controller/inputEvents";
import { addThemeEditorListeners, removeThemeEditorListeners } from "./editor/controller/lifecycle";
import { loadThemeEditor } from "./editor/controller/load";
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
        addThemeEditorListeners(this.shadowRoot, THEME_CATEGORY_SELECTED_EVENT, this.eventHandlers());
        void loadThemeEditor(this.shadowRoot, this.state, () => this.render(), dispatchThemeSettingsChanged);
    }

    disconnectedCallback(): void {
        removeThemeEditorListeners(this.shadowRoot, THEME_CATEGORY_SELECTED_EVENT, this.eventHandlers());
    }

    private render(): void {
        const viewState = this.state.viewState();
        if (!viewState || !this.shadowRoot) {
            return;
        }
        this.state.mode = renderThemeEditor(this.shadowRoot, viewState);
        const context = this.explorerContext();
        if (context) {
            this.state.explorer.renderReferencePicker(context);
        }
    }

    private onClick = (event: Event): void => {
        const context = this.explorerContext();
        if (context && this.state.explorer.handleClick(event, context)) {
            return;
        }
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
            if (!window.confirm("Delete this category and all of its tokens?")) {
                return;
            }
            const removed = this.state.deleteCategory();
            if (removed) {
                this.render();
                dispatchThemeCategoryDeleted(removed);
            }
        } else if (action === "delete-token") {
            const tokenId = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-token-id]")?.dataset
                .tokenId;
            if (tokenId && window.confirm("Delete this token from every theme?") && this.state.deleteToken(tokenId)) {
                this.render();
            }
        } else if (action === "save" || action === "activate") {
            void persistTheme(this.shadowRoot, this.state, action === "activate", () => {
                this.render();
                dispatchThemeSettingsChanged();
            });
        }
        const mode = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>("[data-mode]")?.dataset.mode;
        if (mode === "light" || mode === "dark") {
            this.state.mode = mode;
            this.render();
        }
    };

    private onInput = (event: Event): void => {
        const context = this.explorerContext();
        if (context && this.state.explorer.handleInput(event, context)) {
            return;
        }
        if (this.state.settings && this.shadowRoot) {
            handleThemeInput(event, {
                root: this.shadowRoot,
                settings: this.state.settings,
                selection: this.state.selection,
                selectedThemeId: this.state.selectedThemeId,
                mode: this.state.mode,
            });
        }
    };

    private onChange = (event: Event): void => {
        const target = event.target as HTMLElement & { value?: string };
        if (target.matches?.("[data-theme-switch]") && target.value) {
            this.state.selectedThemeId = target.value;
            this.state.explorer.reset(this.explorerContext());
            this.render();
            return;
        }
        if (target.matches?.("[data-token-type-control]") && this.state.settings && this.shadowRoot) {
            handleThemeInput(event, {
                root: this.shadowRoot,
                settings: this.state.settings,
                selection: this.state.selection,
                selectedThemeId: this.state.selectedThemeId,
                mode: this.state.mode,
            });
            this.render();
        }
    };

    private onCategorySelected = (event: CustomEvent<ThemeSelection>): void => {
        if (this.state.selectCategory(event.detail)) {
            this.render();
        }
    };

    private onKeyDown = (event: Event): void => {
        const context = this.explorerContext();
        if (context) {
            this.state.explorer.handleKeyDown(event, context);
        }
    };

    private explorerContext(): ThemeExplorerContext | undefined {
        if (!this.shadowRoot || !this.state.settings) {
            return undefined;
        }
        return {
            root: this.shadowRoot,
            settings: this.state.settings,
            selectedThemeId: this.state.selectedThemeId,
            mode: this.state.mode,
            render: () => this.render(),
            showError: (message) => setThemeMessage(this.shadowRoot, message, true),
        };
    }

    private eventHandlers() {
        return {
            click: this.onClick,
            change: this.onChange,
            input: this.onInput,
            keydown: this.onKeyDown,
            selection: this.onCategorySelected as EventListener,
        };
    }
}

if (!customElements.get("cms-theme-editor")) {
    customElements.define("cms-theme-editor", CmsThemeEditor);
}
