import { createBlocScope } from "@bernouy/cms-content/browser";
import { callCapability } from "./runtime/client";
import { EditablePageDocument } from "./runtime/document";
import type { EditorCatalogue, EditorCatalogueItem, PageUpdate } from "./runtime/model";
import { EditorStatus } from "./runtime/status";
import { itemForElement, renderCatalogue, renderOutline, renderSettings } from "./runtime/view";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private pageDocument = new EditablePageDocument("");
    private catalogue: EditorCatalogueItem[] = [];
    private selected = -1;
    private pageId: string | null = null;
    private pageRevision = 0;
    private loadedContent = "";
    private dirty = false;
    private initializedIdentity = "";
    private catalogueLoaded = false;
    private readonly observer: MutationObserver;
    private readonly status: EditorStatus;

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
        this.status = new EditorStatus(this.blocRoot);
        this.observer = new MutationObserver(() => {
            this.initializeFromBinding();
        });
    }

    connect(): void {
        this.blocRoot.addEventListener("click", this.handleClick);
        this.blocRoot.addEventListener("input", this.handleInput);
        this.blocRoot.addEventListener("change", this.handleChange);
        this.blocRoot.addEventListener("keydown", this.handleKeydown);
        window.addEventListener("beforeunload", this.handleBeforeUnload);
        this.observer.observe(this.blocRoot, { childList: true, subtree: true });
        this.initializeFromBinding();
    }

    private initializeFromBinding(): void {
        const ready = this.scope.querySelector<HTMLElement>("[data-editor-ready]");
        if (!ready) {
            return;
        }
        const id = ready.querySelector<HTMLElement>("[data-page-id]")?.textContent?.trim() ?? "";
        const revision = Number(ready.querySelector<HTMLElement>("[data-page-revision]")?.textContent?.trim());
        const content = ready.querySelector<HTMLTextAreaElement>("[data-page-content]")?.value ?? "";
        if (!id || !Number.isSafeInteger(revision)) {
            this.status.notice(this.copy("page-identity-missing"), true);
            return;
        }
        const identity = `${id}:${revision}`;
        if (identity === this.initializedIdentity) {
            return;
        }
        this.initializedIdentity = identity;
        this.pageId = id;
        this.pageRevision = revision;
        this.loadedContent = content;
        this.pageDocument.replace(content);
        this.selected = this.pageDocument.elements().length > 0 ? 0 : -1;
        this.render();
        if (!this.catalogueLoaded) {
            this.catalogueLoaded = true;
            void this.loadCatalogue();
        }
    }

    disconnect(): void {
        this.blocRoot.removeEventListener("click", this.handleClick);
        this.blocRoot.removeEventListener("input", this.handleInput);
        this.blocRoot.removeEventListener("change", this.handleChange);
        this.blocRoot.removeEventListener("keydown", this.handleKeydown);
        window.removeEventListener("beforeunload", this.handleBeforeUnload);
        this.observer.disconnect();
    }

    private async loadCatalogue(): Promise<void> {
        await this.status.run(async () => {
            const response = await callCapability<EditorCatalogue>("editor-catalogue", {});
            this.catalogue = response.items;
        });
        this.render();
    }

    private readonly handleClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
        if (!button) {
            return;
        }
        if (button.hasAttribute("data-open-catalogue")) {
            this.openCatalogue();
        } else if (button.hasAttribute("data-close-catalogue")) {
            this.catalogueDialog().close();
        } else if (button.dataset.add) {
            const item = this.catalogue.find(({ id }) => id === button.dataset.add);
            if (item) {
                this.selected = this.pageDocument.add(item);
                this.catalogueDialog().close();
                this.changed();
            }
        } else if (button.dataset.select) {
            this.selected = Number(button.dataset.select);
            this.render();
        } else if (button.dataset.move) {
            this.selected = this.pageDocument.move(this.selected, Number(button.dataset.move) as -1 | 1);
            this.changed();
        } else if (button.hasAttribute("data-duplicate")) {
            this.selected = this.pageDocument.duplicate(this.selected);
            this.changed();
        } else if (button.hasAttribute("data-remove")) {
            this.selected = this.pageDocument.remove(this.selected);
            this.changed();
        } else if (button.dataset.viewport) {
            this.setViewport(button.dataset.viewport);
        } else if (button.hasAttribute("data-save")) {
            void this.save();
        }
    };

    private readonly handleInput = (event: Event): void => {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.matches("[data-search]")) {
            renderCatalogue(this.required("[data-catalogue]"), this.catalogue, target.value);
        } else if (target instanceof HTMLTextAreaElement && target.matches("[data-element-content]")) {
            const element = this.pageDocument.elements()[this.selected];
            this.pageDocument.updateContent(
                this.selected,
                target.value,
                element && itemForElement(element, this.catalogue),
            );
            this.changed(false);
        }
    };

    private readonly handleChange = (event: Event): void => {
        const target = event.target;
        if (target instanceof HTMLSelectElement && target.matches("[data-preview-route]")) {
            this.required<HTMLIFrameElement>("[data-preview]").setAttribute("src", target.value);
            return;
        }
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement) || !target.dataset.setting) {
            return;
        }
        this.pageDocument.updateAttribute(
            this.selected,
            target.dataset.setting,
            target.dataset.settingType === "boolean" && target instanceof HTMLInputElement
                ? target.checked
                : target.value,
        );
        this.changed();
    };

    private readonly handleKeydown = (event: KeyboardEvent): void => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLocaleLowerCase() === "s") {
            event.preventDefault();
            if (this.dirty) {
                void this.save();
            }
        }
    };

    private async save(): Promise<void> {
        const saved = await this.status.run(async () => {
            this.required("[data-save-state]").textContent = this.copy("saving");
            const id = this.pageId;
            const revision = this.pageRevision;
            if (!id || !Number.isSafeInteger(revision)) {
                throw new Error(this.copy("page-revision-missing"));
            }
            const latest = await callCapability<PageUpdate>("get", { id });
            if (latest.content !== this.loadedContent) {
                throw new Error(this.copy("page-changed"));
            }
            const updated = await callCapability<PageUpdate>("update", {
                id,
                expectedRevision: latest.revision,
                content: this.pageDocument.serialize(),
            });
            this.pageRevision = updated.revision;
            this.loadedContent = updated.content;
            this.pageDocument.replace(updated.content);
            this.dirty = false;
            this.status.notice(this.copy("document-saved"));
        });
        this.render();
        if (saved) {
            this.reloadPreview();
        }
    }

    private changed(renderInspector = true): void {
        this.dirty = this.pageDocument.serialize() !== this.loadedContent;
        this.updateSaveState();
        if (renderInspector) {
            this.render();
        }
    }

    private render(): void {
        const elements = this.pageDocument.elements();
        renderCatalogue(
            this.required("[data-catalogue]"),
            this.catalogue,
            this.required<HTMLInputElement>("[data-search]").value,
        );
        renderOutline(this.required("[data-outline]"), elements, this.catalogue, this.selected);
        this.required("[data-empty]").toggleAttribute("hidden", elements.length > 0);
        const selected = elements[this.selected];
        this.required("[data-inspector-empty]").toggleAttribute("hidden", Boolean(selected));
        this.required("[data-inspector]").toggleAttribute("hidden", !selected);
        if (selected) {
            const item = itemForElement(selected, this.catalogue);
            this.required("[data-selected-label]").textContent = item?.name ?? selected.localName;
            this.required("[data-content-field]").toggleAttribute(
                "hidden",
                !this.pageDocument.isTextEditable(this.selected, item),
            );
            this.required<HTMLTextAreaElement>("[data-element-content]").value = this.pageDocument.editableContent(
                this.selected,
                item,
            );
            renderSettings(this.required("[data-settings]"), selected, item);
        }
        this.updateSaveState();
        this.required<HTMLButtonElement>('[data-move="-1"]').disabled = !selected || this.selected === 0;
        this.required<HTMLButtonElement>('[data-move="1"]').disabled =
            !selected || this.selected === elements.length - 1;
    }

    private reloadPreview(): void {
        const iframe = this.required<HTMLIFrameElement>("[data-preview]");
        const source = iframe.getAttribute("src");
        if (source) {
            iframe.setAttribute("src", source);
        }
    }

    private updateSaveState(): void {
        this.required<HTMLButtonElement>("[data-save]").disabled = !this.dirty;
        this.required("[data-save-state]").textContent = this.copy(this.dirty ? "unsaved-changes" : "document-saved");
    }

    private setViewport(viewport: string): void {
        this.required<HTMLElement>("[data-preview-frame]").dataset.viewport = viewport;
        for (const button of this.scope.querySelectorAll<HTMLButtonElement>("[data-viewport]")) {
            button.setAttribute("aria-pressed", String(button.dataset.viewport === viewport));
        }
    }

    private readonly handleBeforeUnload = (event: BeforeUnloadEvent): void => {
        if (this.dirty) {
            event.preventDefault();
        }
    };

    private openCatalogue(): void {
        const dialog = this.catalogueDialog();
        if (!dialog.open) {
            dialog.showModal();
        }
        this.required<HTMLInputElement>("[data-search]").focus();
    }

    private catalogueDialog(): HTMLDialogElement {
        return this.required<HTMLDialogElement>("[data-catalogue-dialog]");
    }

    private required<T extends Element = HTMLElement>(selector: string): T {
        const element = this.scope.querySelector<T>(selector);
        if (!element) {
            throw new Error(`Missing Page editor element: ${selector}`);
        }
        return element;
    }

    private copy(name: string): string {
        return this.required<HTMLElement>(`[data-copy="${CSS.escape(name)}"]`).textContent?.trim() ?? "";
    }
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    return () => {
        controller.disconnect();
    };
}
