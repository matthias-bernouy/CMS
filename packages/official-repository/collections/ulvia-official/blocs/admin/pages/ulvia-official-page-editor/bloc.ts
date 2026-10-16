import { createBlocScope } from "@bernouy/cms-content/browser";
import { callCapability } from "./runtime/client";
import { EditablePageDocument } from "./runtime/document";
import type { EditorCatalogue, EditorCatalogueItem, PageUpdate } from "./runtime/model";
import { EditorStatus } from "./runtime/status";
import { itemForElement, renderCatalogue, renderOutline, renderSettings } from "./runtime/view";

const PAGE_ID_PARAM = "ulvia-official-page-id";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private pageDocument = new EditablePageDocument("");
    private catalogue: EditorCatalogueItem[] = [];
    private selected = -1;
    private pageId: string | null = null;
    private pageRevision = 0;
    private loadedContent = "";
    private readonly status: EditorStatus;

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
        this.status = new EditorStatus(this.blocRoot);
    }

    connect(): void {
        this.blocRoot.addEventListener("click", this.handleClick);
        this.blocRoot.addEventListener("input", this.handleInput);
        this.blocRoot.addEventListener("change", this.handleChange);
        this.render();
        void this.load();
    }

    private async load(): Promise<void> {
        await this.status.run(async () => {
            const id = new URL(location.href).searchParams.get(PAGE_ID_PARAM);
            if (!id) {
                throw new Error(this.copy("page-identity-missing"));
            }
            const page = await callCapability<PageUpdate>("get", { id });
            this.pageId = page.id;
            this.pageRevision = page.revision;
            this.loadedContent = page.content;
            this.pageDocument.replace(page.content);
            this.render();
        });
        await this.loadCatalogue();
    }

    disconnect(): void {
        this.blocRoot.removeEventListener("click", this.handleClick);
        this.blocRoot.removeEventListener("input", this.handleInput);
        this.blocRoot.removeEventListener("change", this.handleChange);
    }

    private async loadCatalogue(): Promise<void> {
        await this.status.run(async () => {
            const response = await callCapability<EditorCatalogue>("editor-catalogue", {});
            this.catalogue = response.items;
            this.render();
        });
    }

    private readonly handleClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button");
        if (!button) {
            return;
        }
        if (button.dataset.add) {
            const item = this.catalogue.find(({ id }) => id === button.dataset.add);
            if (item) {
                this.selected = this.pageDocument.add(item);
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
        } else if (button.hasAttribute("data-apply-source")) {
            this.pageDocument.replace(this.required<HTMLTextAreaElement>("[data-source]").value);
            this.selected = -1;
            this.changed();
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
        this.changed(false);
    };

    private save(): Promise<void> {
        return this.status.run(async () => {
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
            this.status.notice(this.copy("document-saved"));
            location.reload();
        });
    }

    private changed(renderInspector = true): void {
        this.required<HTMLTextAreaElement>("[data-source]").value = this.pageDocument.serialize();
        this.required<HTMLIFrameElement>("[data-preview]").srcdoc = this.pageDocument.serialize();
        if (renderInspector) {
            this.render();
        }
        this.status.notice(this.copy("unsaved-changes"));
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
            this.required<HTMLTextAreaElement>("[data-element-content]").value = this.pageDocument.editableContent(
                this.selected,
                item,
            );
            renderSettings(this.required("[data-settings]"), selected, item);
        }
        this.required<HTMLTextAreaElement>("[data-source]").value = this.pageDocument.serialize();
        this.required<HTMLIFrameElement>("[data-preview]").srcdoc = this.pageDocument.serialize();
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
