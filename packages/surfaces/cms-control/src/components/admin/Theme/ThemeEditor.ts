import { Component } from "@bernouy/components/base";
import { adminSystemSettingsStore } from "../Common/SystemSettings/store";

import {
    THEME_CATEGORY_SELECTED_EVENT,
    THEME_NAV_ACTION_REQUESTED_EVENT,
    dispatchThemeCategoryAdded,
    dispatchThemeCategoryDeleted,
    dispatchThemeCategoryUpdated,
    dispatchThemeSettingsRefreshed,
    type ThemeSelection,
    type ThemeNavAction,
} from "./events";
import { type ContextDialogAction, ThemeEditorDialogs } from "./editor/controller/dialogs";
import {
    clickAction,
    handleLengthControlMode,
    handleThemeInput,
    handleTokenControlMode,
    resetThemeToken,
} from "./editor/controller/inputEvents";
import { persistTheme } from "./editor/controller/persistence";
import { ThemeEditorState } from "./editor/controller/state";
import css from "./editor/styles";
import template from "./editor/ThemeEditor.html" with { type: "text" };
import { renderThemeEditor, setThemeMessage } from "./editor/view";

export class CmsThemeEditor extends Component {
    private readonly state = new ThemeEditorState();
    private readonly dialogs: ThemeEditorDialogs;

    constructor() {
        super({ css, template: template as unknown as string });
        this.dialogs = new ThemeEditorDialogs(this.shadowRoot!);
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.shadowRoot?.addEventListener("click", this.onClick);
        this.shadowRoot?.addEventListener("change", this.onChange);
        this.shadowRoot?.addEventListener("input", this.onInput);
        this.shadowRoot?.addEventListener("submit", this.onSubmit);
        this.shadowRoot?.addEventListener("close", this.onModalClose);
        window.addEventListener(THEME_CATEGORY_SELECTED_EVENT, this.onCategorySelected as EventListener);
        window.addEventListener(THEME_NAV_ACTION_REQUESTED_EVENT, this.onNavigationAction as EventListener);
        void this.load();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener("change", this.onChange);
        this.shadowRoot?.removeEventListener("input", this.onInput);
        this.shadowRoot?.removeEventListener("submit", this.onSubmit);
        this.shadowRoot?.removeEventListener("close", this.onModalClose);
        window.removeEventListener(THEME_CATEGORY_SELECTED_EVENT, this.onCategorySelected as EventListener);
        window.removeEventListener(THEME_NAV_ACTION_REQUESTED_EVENT, this.onNavigationAction as EventListener);
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
                this.valueMode(),
            )
        ) {
            this.render();
            return;
        }
        const action = clickAction(event);
        if (action === "theme") {
            this.openContextModal("create-theme");
        } else if (action === "edit-theme") {
            this.openContextModal("rename-theme");
        } else if (action === "close-context") {
            this.dialogs.closeContext();
        } else if (action === "edit-token") {
            this.openVariableEdit(event);
        } else if (action === "close-variable-edit") {
            this.dialogs.closeVariableEdit();
        } else if (action === "delete-token") {
            this.deleteToken();
        } else if (action === "save" || action === "activate") {
            void persistTheme(this.shadowRoot, this.state, action === "activate", () => this.refreshAfterSave());
        }
    };

    private onInput = (event: Event): void => {
        this.handleInput(event);
    };

    private onChange = (event: Event): void => {
        const target = event.target as HTMLElement & { value?: string };
        if (handleTokenControlMode(event) || handleLengthControlMode(event)) {
            return;
        }
        if (target.matches?.("[data-theme-switch]") && target.value) {
            this.state.selectedThemeId = target.value;
            this.updateContextUrl("theme", target.value);
            this.render();
            return;
        }
        if (target.matches?.("[data-mode-switch]") && (target.value === "light" || target.value === "dark")) {
            if (this.state.mode !== target.value) {
                this.state.mode = target.value;
                this.updateContextUrl("mode", target.value);
                this.render();
            }
            return;
        }
        if (
            target.matches?.(
                "[data-token-value-control], [data-length-number], [data-length-unit], input[type='color']",
            )
        ) {
            this.handleInput(event);
            this.render();
        }
    };

    private onCategorySelected = (event: CustomEvent<ThemeSelection>): void => {
        if (this.state.selectCategory(event.detail)) {
            this.render();
        }
    };

    private onNavigationAction = (event: CustomEvent<ThemeNavAction>): void => {
        if (event.detail === "create-group") {
            this.openContextModal("create-group");
        } else if (event.detail === "add-variable") {
            this.dialogs.openVariable();
        } else if (event.detail === "edit-group") {
            this.openContextModal("edit-group");
        } else if (event.detail === "delete-group") {
            this.deleteCategory();
        }
    };

    private onSubmit = (event: Event): void => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) {
            return;
        }
        if (form.matches("[data-context-form]")) {
            event.preventDefault();
            this.submitContext(form);
        } else if (form.matches("[data-variable-form]")) {
            event.preventDefault();
            const draft = this.dialogs.readVariable(form);
            if (draft && this.state.createToken(draft)) {
                this.render();
                this.dialogs.closeVariable();
            }
        } else if (form.matches("[data-variable-edit-form]")) {
            event.preventDefault();
            const submission = this.dialogs.readVariableEdit(form);
            if (submission && this.state.updateToken(submission.tokenId, submission.label, submission.description)) {
                this.render();
                this.dialogs.closeVariableEdit();
            }
        }
    };

    private submitContext(form: HTMLFormElement): void {
        const submission = this.dialogs.readContext(form);
        if (!submission) {
            return;
        }
        let completed = false;
        if (submission.action === "create-theme") {
            completed = this.state.createTheme(submission.name);
            if (completed) {
                this.updateContextUrl("theme", this.state.selectedThemeId);
            }
        } else if (submission.action === "rename-theme") {
            completed = this.state.renameTheme(submission.name);
        } else if (submission.action === "create-group") {
            const added = this.state.createCategory(submission.name, submission.description);
            completed = Boolean(added);
            if (added) {
                dispatchThemeCategoryAdded(added);
            }
        } else {
            const updated = this.state.updateCategory(submission.name, submission.description);
            completed = Boolean(updated);
            if (updated) {
                dispatchThemeCategoryUpdated(updated);
            }
        }
        if (completed) {
            this.render();
            this.dialogs.closeContext();
        }
    }

    private onModalClose = (event: Event): void => this.dialogs.handleClose(event);

    private handleInput(event: Event): void {
        if (!this.state.settings || !this.shadowRoot) {
            return;
        }
        handleThemeInput(event, {
            root: this.shadowRoot,
            settings: this.state.settings,
            selection: this.state.selection,
            selectedThemeId: this.state.selectedThemeId,
            mode: this.valueMode(),
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
        if (!window.confirm("Delete this group and all of its variables?")) {
            return;
        }
        const removed = this.state.deleteCategory();
        if (removed) {
            this.render();
            dispatchThemeCategoryDeleted(removed);
        }
    }

    private deleteToken(): void {
        const tokenId = this.dialogs.editedVariableId();
        if (tokenId && window.confirm("Delete this variable from every theme?") && this.state.deleteToken(tokenId)) {
            this.dialogs.closeVariableEdit();
            this.render();
        }
    }

    private openVariableEdit(event: Event): void {
        const tokenId = (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-token-id]")?.dataset.tokenId;
        const token = tokenId ? this.state.token(tokenId) : undefined;
        if (token) {
            this.dialogs.openVariableEdit(token);
        }
    }

    private valueMode(): "light" | "dark" {
        const source = this.state.settings?.sources.find((item) => item.id === this.state.selection.sourceId);
        return source?.supportsModes ? this.state.mode : "light";
    }

    private updateContextUrl(key: "theme" | "mode", value: string): void {
        const url = new URL(window.location.href);
        url.searchParams.set(key, value);
        window.history.replaceState(null, "", url);
    }

    private openContextModal(action: ContextDialogAction): void {
        const settings = this.state.settings;
        if (!settings) {
            return;
        }
        const theme = settings.themes.find((item) => item.id === this.state.selectedThemeId);
        const source = settings.sources.find((item) => item.id === this.state.selection.sourceId);
        const category = source?.categories.find((item) => item.id === this.state.selection.categoryId);
        this.dialogs.openContext(action, {
            themeName: theme?.name,
            categoryLabel: category?.label,
            categoryDescription: category?.description,
        });
    }
}

if (!customElements.get("cms-theme-editor")) {
    customElements.define("cms-theme-editor", CmsThemeEditor);
}
