import {
    clearNavigationDragState,
    closeNavigationItemEditor,
    deleteNavigationItem,
    handleNavigationAction,
    handleNavigationDragOver,
    handleNavigationDragStart,
    handleNavigationDrop,
    handleNavigationEditorChange,
    handleNavigationItemEditorClosed,
    handleNavigationKeydown,
    openNavigationItemEditor,
    saveNavigationItemEditor,
} from "../workspace/navigation";
import { DashboardNavigationEditorState } from "./navigation/EditorState";

export class CmsDashboardNavigationEditor extends DashboardNavigationEditorState {
    static formAssociated = true;
    static observedAttributes = ["value", "views", "readonly"];

    override connectedCallback(): void {
        super.connectedCallback();
        this.shadowRoot?.addEventListener("click", this.onClick);
        this.shadowRoot?.addEventListener("submit", this.onSubmit);
        this.shadowRoot?.addEventListener("change", this.onChange);
        this.shadowRoot?.addEventListener("dragstart", this.onDragStart as EventListener);
        this.shadowRoot?.addEventListener("dragover", this.onDragOver as EventListener);
        this.shadowRoot?.addEventListener("drop", this.onDrop as EventListener);
        this.shadowRoot?.addEventListener("dragend", this.onDragEnd);
        this.shadowRoot?.addEventListener("close", this.onModalClose);
        this.shadowRoot?.addEventListener("keydown", this.onKeydown as EventListener);
        this.renderEditor();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener("submit", this.onSubmit);
        this.shadowRoot?.removeEventListener("change", this.onChange);
        this.shadowRoot?.removeEventListener("dragstart", this.onDragStart as EventListener);
        this.shadowRoot?.removeEventListener("dragover", this.onDragOver as EventListener);
        this.shadowRoot?.removeEventListener("drop", this.onDrop as EventListener);
        this.shadowRoot?.removeEventListener("dragend", this.onDragEnd);
        this.shadowRoot?.removeEventListener("close", this.onModalClose);
        this.shadowRoot?.removeEventListener("keydown", this.onKeydown as EventListener);
    }

    private readonly onClick = (event: Event): void => {
        if (this.hasAttribute("readonly")) {
            return;
        }
        const target = event.target as Element | null;
        if (!target || target.closest("[data-navigation-drag-handle]")) {
            return;
        }
        const result = handleNavigationAction(target, this.views);
        if (result.handled) {
            if (result.created) {
                openNavigationItemEditor(this.shadowRoot!, result.created, this.views, true);
            }
            this.syncFormValue();
            return;
        }
        const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
        if (action === "edit-navigation-item") {
            const node = target.closest<HTMLElement>("[data-navigation-node]");
            if (node) {
                openNavigationItemEditor(this.shadowRoot!, node, this.views);
            }
        } else if (action === "close-navigation-item") {
            closeNavigationItemEditor(this.shadowRoot!);
            this.syncFormValue();
        } else if (action === "delete-navigation-item") {
            deleteNavigationItem(this.shadowRoot!);
            this.syncFormValue();
        }
    };

    private readonly onSubmit = (event: Event): void => {
        const form = event.target;
        if (!(form instanceof HTMLFormElement) || !form.matches("[data-navigation-item-form]")) {
            return;
        }
        event.preventDefault();
        saveNavigationItemEditor(this.shadowRoot!, this.views);
        this.syncFormValue();
    };

    private readonly onChange = (event: Event): void => {
        const control = event.target;
        if (control instanceof Element) {
            handleNavigationEditorChange(control, this.views);
        }
    };

    private readonly onDragStart = (event: DragEvent): void => handleNavigationDragStart(this.shadowRoot!, event);
    private readonly onDragOver = (event: DragEvent): void => handleNavigationDragOver(this.shadowRoot!, event);
    private readonly onDrop = (event: DragEvent): void => {
        handleNavigationDrop(this.shadowRoot!, event);
        this.syncFormValue();
    };
    private readonly onDragEnd = (): void => clearNavigationDragState(this.shadowRoot!);
    private readonly onModalClose = (event: Event): void => {
        if (
            event.target instanceof Element &&
            event.target.matches("[data-navigation-item-dialog]") &&
            !event.target.hasAttribute("open")
        ) {
            handleNavigationItemEditorClosed(this.shadowRoot!);
            this.syncFormValue();
        }
    };
    private readonly onKeydown = (event: KeyboardEvent): void => {
        if (handleNavigationKeydown(this.shadowRoot!, event)) {
            return;
        }
        const target = event.target;
        if (
            target instanceof HTMLElement &&
            target.matches(".dashboard-navigation-row") &&
            (event.key === "Enter" || event.key === " ")
        ) {
            event.preventDefault();
            target.click();
        }
    };
}
