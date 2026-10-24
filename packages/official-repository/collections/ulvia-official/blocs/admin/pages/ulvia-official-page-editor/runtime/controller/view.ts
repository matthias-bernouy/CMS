import { createBlocScope } from "@bernouy/cms-content/browser";
import type { EditableInsertionTarget, EditablePageDocument } from "../document/index";
import type { EditorHistory } from "../document/history";
import type { EditorFrame } from "../frame";
import type { EditorCatalogueItem } from "../model";
import {
    itemForElement,
    renderCatalogue,
    renderContentFields,
    renderNativeElementFields,
    renderOutline,
    renderRootFields,
    renderSettings,
} from "../view/index";

export type EditorRenderState = Readonly<{
    catalogue: EditorCatalogueItem[];
    document: EditablePageDocument;
    dirty: boolean;
    frame: EditorFrame | null;
    history: EditorHistory;
    insertionTarget: EditableInsertionTarget;
    previewStale: boolean;
    selected: HTMLElement | null;
}>;

type EditorFormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export class PageEditorView {
    private readonly scope: ReturnType<typeof createBlocScope>;

    constructor(root: HTMLElement) {
        this.scope = createBlocScope(root);
    }

    render(state: EditorRenderState): void {
        const elements = state.document.elements();
        this.renderCatalogue(state.document, state.catalogue, state.insertionTarget);
        renderOutline(this.required("[data-outline]"), state.document, state.catalogue, state.selected);
        state.frame?.map(state.document, state.catalogue);
        state.frame?.highlightSource(state.selected);
        this.required("[data-empty]").toggleAttribute("hidden", elements.length > 0);
        this.renderInspector(state);
        this.updateSaveState(state.dirty);
        this.updateHistoryState(state.history);
        this.updatePreviewState(state.previewStale);
        this.required<HTMLButtonElement>('[name="move"][value="-1"]').disabled =
            !state.selected || !state.document.canMove(state.selected, -1);
        this.required<HTMLButtonElement>('[name="move"][value="1"]').disabled =
            !state.selected || !state.document.canMove(state.selected, 1);
        this.required<HTMLButtonElement>("#page-editor-remove").disabled =
            !state.selected || !state.document.canRemove(state.selected, state.catalogue);
    }

    renderCatalogue(
        documentModel: EditablePageDocument,
        catalogue: EditorCatalogueItem[],
        target: EditableInsertionTarget,
        query = this.requiredControl<HTMLInputElement>("#page-editor-search-control").value,
    ): void {
        renderCatalogue(this.required("[data-catalogue]"), catalogue, query, { document: documentModel, target });
    }

    resetCatalogueSearch(): void {
        this.requiredControl<HTMLInputElement>("#page-editor-search-control").value = "";
    }

    updateSaveState(dirty: boolean): void {
        this.required<HTMLButtonElement>("#page-editor-save").disabled = !dirty;
        this.required("[data-save-state]").textContent = this.copy(dirty ? "unsaved-changes" : "document-saved");
    }

    updateHistoryState(history: EditorHistory): void {
        this.required<HTMLButtonElement>("#page-editor-undo").disabled = !history.canUndo;
        this.required<HTMLButtonElement>("#page-editor-redo").disabled = !history.canRedo;
    }

    updatePreviewState(stale: boolean): void {
        this.required("[data-preview-stale]").toggleAttribute("hidden", !stale);
    }

    setViewport(viewport: string): void {
        this.required<HTMLElement>("[data-preview-frame]").dataset.viewport = viewport;
        for (const button of this.scope.queryBlocRoots<HTMLButtonElement>("ulvia-official-action")) {
            if (button.name === "viewport") {
                button.setAttribute("aria-pressed", String(button.value === viewport));
            }
        }
    }

    setPreviewRoute(route: string): void {
        this.required<HTMLIFrameElement>("[data-preview]").setAttribute("src", route);
    }

    reloadPreview(): void {
        const iframe = this.required<HTMLIFrameElement>("[data-preview]");
        const source = iframe.getAttribute("src");
        if (source) {
            iframe.setAttribute("src", source);
        }
    }

    openCatalogue(): void {
        const dialog = this.catalogueDialog();
        if (!dialog.open) {
            dialog.showModal();
        }
        this.requiredControl<HTMLInputElement>("#page-editor-search-control").focus();
    }

    closeCatalogue(): void {
        this.catalogueDialog().close();
    }

    query<T extends Element = HTMLElement>(selector: string): T | null {
        const owned = this.scope.querySelector<T>(selector);
        if (owned) {
            return owned;
        }
        return (this.scope.queryBlocRoots().find((root) => root.matches(selector)) as T | undefined) ?? null;
    }

    required<T extends Element = HTMLElement>(selector: string): T {
        const element = this.query<T>(selector);
        if (!element) {
            throw new Error(`Missing Page editor element: ${selector}`);
        }
        return element;
    }

    private requiredControl<T extends EditorFormControl>(selector: string): T {
        const root = this.required<HTMLElement>(selector);
        const control = this.scope.getFormControl<T>(root);
        if (!control) {
            throw new Error(`Missing Page editor form control: ${selector}`);
        }
        return control;
    }

    copy(name: string): string {
        return this.required<HTMLElement>(`[data-copy="${CSS.escape(name)}"]`).textContent?.trim() ?? "";
    }

    private renderInspector(state: EditorRenderState): void {
        const selected = state.selected;
        this.required("[data-inspector-empty]").toggleAttribute("hidden", Boolean(selected));
        this.required("[data-inspector]").toggleAttribute("hidden", !selected);
        if (!selected) {
            return;
        }
        const item = itemForElement(selected, state.catalogue);
        this.required("[data-selected-label]").textContent = item?.name ?? selected.localName;
        renderRootFields(this.required("[data-root-fields]"), selected, item, {
            linkUrl: this.copy("link-url"),
            nativeElement: this.copy("native-element"),
        });
        renderContentFields(this.required("[data-content-fields]"), state.document, selected, item, (field) =>
            state.frame?.contentValue(selected, field.slot, field.position),
        );
        const mediaLabels = { chooseImage: this.copy("choose-image") };
        renderNativeElementFields(this.required("[data-native-fields]"), state.document, selected, item, mediaLabels);
        renderSettings(this.required("[data-settings]"), selected, item, mediaLabels);
    }

    private catalogueDialog(): HTMLDialogElement {
        return this.required<HTMLDialogElement>("[data-catalogue-dialog]");
    }

    openMediaPicker(): void {
        const dialog = this.required<HTMLDialogElement>("[data-media-dialog]");
        if (!dialog.open) {
            dialog.showModal();
        }
    }

    closeMediaPicker(): void {
        this.required<HTMLDialogElement>("[data-media-dialog]").close();
    }

    openCompositionDialog(): void {
        const dialog = this.required<HTMLDialogElement>("[data-composition-dialog]");
        if (!dialog.open) {
            dialog.showModal();
        }
        this.required<HTMLInputElement>("#page-editor-composition-name").focus();
    }

    closeCompositionDialog(): void {
        this.required<HTMLDialogElement>("[data-composition-dialog]").close();
    }
}
