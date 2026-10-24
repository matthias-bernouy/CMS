import type { EditorFrame } from "../frame";
import type { EditorCatalogueItem } from "../model";
import type { PageEditingState } from "./editing";
import { updateNativeControl, updateNativeTextControl } from "./nativeInteractions";
import type { PageEditorView } from "./view";

type InteractionDependencies = Readonly<{
    catalogue: () => EditorCatalogueItem[];
    changed: (options?: { render?: boolean; previewStale?: boolean }) => void;
    createComposition: (input: SiteCompositionInput) => Promise<boolean>;
    dirty: () => boolean;
    editing: PageEditingState;
    frame: () => EditorFrame | null;
    save: () => void;
    view: PageEditorView;
}>;

export type SiteCompositionInput = Readonly<{
    tag: string;
    name: string;
    group: string;
    description: string;
    content: string;
}>;

type MediaTarget =
    | Readonly<{ kind: "native"; slot: string; attribute: string }>
    | Readonly<{ kind: "setting"; setting: string }>;

type SelectedFile = Readonly<{ path?: unknown }>;

export class PageEditorInteractions {
    private mediaTarget: MediaTarget | null = null;

    constructor(
        private readonly root: HTMLElement,
        private readonly dependencies: InteractionDependencies,
    ) {}

    connect(): void {
        this.root.addEventListener("click", this.handleClick);
        this.root.addEventListener("input", this.handleInput);
        this.root.addEventListener("change", this.handleChange);
        this.root.addEventListener("keydown", this.handleKeydown);
        this.root.addEventListener("ulvia-file:selected", this.handleFileSelected);
    }

    disconnect(): void {
        this.root.removeEventListener("click", this.handleClick);
        this.root.removeEventListener("input", this.handleInput);
        this.root.removeEventListener("change", this.handleChange);
        this.root.removeEventListener("keydown", this.handleKeydown);
        this.root.removeEventListener("ulvia-file:selected", this.handleFileSelected);
    }

    private readonly handleClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
        if (!button) {
            return;
        }
        const { editing, view } = this.dependencies;
        const catalogue = this.dependencies.catalogue();
        if (button.id === "page-editor-open-catalogue") {
            editing.insertionTarget = { parent: null, slot: "" };
            this.openCatalogue();
        } else if (button.id === "page-editor-close-catalogue") {
            view.closeCatalogue();
        } else if (button.id === "page-editor-close-media") {
            this.closeMediaPicker();
        } else if (button.id === "page-editor-open-composition") {
            if (editing.selected) {
                view.openCompositionDialog();
            }
        } else if (button.id === "page-editor-close-composition") {
            view.closeCompositionDialog();
        } else if (button.id === "page-editor-create-composition") {
            this.createComposition();
        } else if (button.dataset.openMediaPicker !== undefined) {
            this.mediaTarget = mediaTarget(button);
            if (this.mediaTarget) {
                view.openMediaPicker();
            }
        } else if (button.dataset.add) {
            const item = catalogue.find(({ id }) => id === button.dataset.add);
            if (item && editing.add(item, catalogue)) {
                this.dependencies.changed({ previewStale: true });
                view.closeCatalogue();
            }
        } else if (button.dataset.addParent !== undefined && button.dataset.addSlot !== undefined) {
            if (editing.setInsertionTarget(button.dataset.addParent, button.dataset.addSlot)) {
                this.openCatalogue();
            }
        } else if (button.dataset.select !== undefined) {
            editing.select(button.dataset.select);
            this.dependencies.changed();
        } else if (button.name === "move") {
            if (editing.move(Number(button.value) as -1 | 1)) {
                this.dependencies.changed({ previewStale: true });
            }
        } else if (button.id === "page-editor-duplicate") {
            if (editing.duplicate(catalogue)) {
                this.dependencies.changed({ previewStale: true });
            }
        } else if (button.id === "page-editor-remove") {
            if (editing.remove(catalogue)) {
                this.dependencies.changed({ previewStale: true });
            }
        } else if (button.id === "page-editor-undo") {
            this.restore(editing.undo());
        } else if (button.id === "page-editor-redo") {
            this.restore(editing.redo());
        } else if (button.name === "viewport") {
            view.setViewport(button.value);
        } else if (button.id === "page-editor-save") {
            this.dependencies.save();
        }
    };

    private createComposition(): void {
        const container = this.dependencies.view.required<HTMLElement>("#page-editor-composition-form");
        const selected = this.dependencies.editing.selected;
        const controls = Array.from(
            container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"),
        );
        if (!selected || controls.some((control) => !control.reportValidity())) {
            return;
        }
        const value = (name: string) =>
            container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value.trim() ?? "";
        void this.dependencies
            .createComposition({
                tag: value("tag"),
                name: value("name"),
                group: value("group"),
                description: value("description"),
                content: selected.outerHTML,
            })
            .then((created) => {
                if (created) {
                    this.dependencies.view.closeCompositionDialog();
                    controls.forEach((control) => {
                        control.value = "";
                    });
                }
            });
    }

    private readonly handleFileSelected = (event: Event): void => {
        if (!(event instanceof CustomEvent) || typeof (event.detail as SelectedFile | null)?.path !== "string") {
            return;
        }
        const target = this.mediaTarget;
        const path = (event.detail as { path: string }).path;
        if (!target || !path) {
            return;
        }
        const selected =
            target.kind === "native"
                ? this.dependencies.editing.updateNativeAttribute(target.slot, target.attribute, path)
                : this.dependencies.editing.updateSetting(target.setting, path);
        if (!selected) {
            return;
        }
        if (target.kind === "setting") {
            this.dependencies.frame()?.updateAttribute(selected, target.setting, path);
            this.dependencies.changed();
        } else {
            this.dependencies.changed({ previewStale: true });
        }
        this.closeMediaPicker();
    };

    private readonly handleInput = (event: Event): void => {
        const target = event.target;
        const { editing, view } = this.dependencies;
        if (target instanceof HTMLInputElement && target.id === "page-editor-search") {
            view.renderCatalogue(
                editing.document,
                this.dependencies.catalogue(),
                editing.insertionTarget,
                target.value,
            );
        } else if (updateNativeTextControl(target, editing)) {
            this.dependencies.changed({ previewStale: true });
        } else if (target instanceof HTMLInputElement && target.dataset.rootAttribute) {
            const selected = editing.updateRootAttribute(target.dataset.rootAttribute, target.value);
            if (selected) {
                this.dependencies.frame()?.updateAttribute(selected, target.dataset.rootAttribute, target.value);
                this.dependencies.changed({ render: false });
            }
        } else if (
            target instanceof HTMLTextAreaElement &&
            target.dataset.contentAddress !== undefined &&
            target.dataset.contentPosition !== undefined &&
            target.dataset.contentSlot !== undefined
        ) {
            const selected = editing.updateContent(target.dataset.contentAddress, target.value);
            if (selected) {
                this.dependencies
                    .frame()
                    ?.updateContent(
                        selected,
                        target.dataset.contentSlot,
                        Number(target.dataset.contentPosition),
                        target.value,
                    );
                this.dependencies.changed({ render: false });
            }
        }
    };

    private readonly handleChange = (event: Event): void => {
        const target = event.target;
        if (target instanceof HTMLSelectElement && target.id === "page-editor-preview-route") {
            this.dependencies.view.setPreviewRoute(target.value);
            return;
        }
        if (target instanceof HTMLSelectElement && target.dataset.rootTag !== undefined) {
            const selected = this.dependencies.editing.selected;
            const item = selected
                ? this.dependencies.catalogue().find(({ id }) => id === selected.getAttribute("cms-bloc"))
                : undefined;
            if (this.dependencies.editing.updateRootTag(target.value, item)) {
                this.dependencies.changed({ previewStale: true });
            }
            return;
        }
        if (updateNativeControl(target, this.dependencies.editing)) {
            this.dependencies.changed({ previewStale: true });
            return;
        }
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement) || !target.dataset.setting) {
            return;
        }
        const value =
            target.dataset.settingType === "boolean" && target instanceof HTMLInputElement
                ? target.checked
                : target.value;
        const selected = this.dependencies.editing.updateSetting(target.dataset.setting, value);
        if (selected) {
            this.dependencies.frame()?.updateAttribute(selected, target.dataset.setting, value);
            this.dependencies.changed();
        }
    };

    private readonly handleKeydown = (event: KeyboardEvent): void => {
        const modifier = event.ctrlKey || event.metaKey;
        const key = event.key.toLocaleLowerCase();
        if (modifier && key === "s") {
            event.preventDefault();
            if (this.dependencies.dirty()) {
                this.dependencies.save();
            }
            return;
        }
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
            return;
        }
        if (modifier && !event.shiftKey && key === "z") {
            event.preventDefault();
            this.restore(this.dependencies.editing.undo());
        } else if (modifier && (key === "y" || (event.shiftKey && key === "z"))) {
            event.preventDefault();
            this.restore(this.dependencies.editing.redo());
        }
    };

    private openCatalogue(): void {
        this.dependencies.view.resetCatalogueSearch();
        this.dependencies.changed();
        this.dependencies.view.openCatalogue();
    }

    private restore(restored: boolean): void {
        if (restored) {
            this.dependencies.changed({ previewStale: true });
        }
    }

    private closeMediaPicker(): void {
        this.dependencies.view.closeMediaPicker();
        this.mediaTarget = null;
    }
}

function mediaTarget(button: HTMLButtonElement): MediaTarget | null {
    if (button.dataset.mediaSetting) {
        return { kind: "setting", setting: button.dataset.mediaSetting };
    }
    if (button.dataset.mediaNativeSlot !== undefined && button.dataset.mediaNativeAttribute) {
        return {
            kind: "native",
            slot: button.dataset.mediaNativeSlot,
            attribute: button.dataset.mediaNativeAttribute,
        };
    }
    return null;
}
