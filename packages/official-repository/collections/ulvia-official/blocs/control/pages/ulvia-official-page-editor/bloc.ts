import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { callCapability } from "./runtime/client";
import { EditablePageDocument } from "./runtime/document";
import type { EditorCatalogue, EditorCatalogueItem, PageUpdate } from "./runtime/model";
import { EditorStatus } from "./runtime/status";
import { itemForElement, renderCatalogue, renderOutline, renderSettings } from "./runtime/view";
import { initializePageEditor } from "./runtime/workspace";

export class Bloc extends Component {
    private pageDocument = new EditablePageDocument("");
    private catalogue: EditorCatalogueItem[] = [];
    private selected = -1;
    private readonly status: EditorStatus;

    constructor() {
        super({ css, template });
        initializePageEditor(this.shadowRoot!);
        this.status = new EditorStatus(this.shadowRoot!);
    }

    override connectedCallback(): void {
        this.pageDocument.replace(this.getAttribute("document") ?? "");
        this.shadowRoot?.addEventListener("click", this.handleClick);
        this.shadowRoot?.addEventListener("input", this.handleInput);
        this.shadowRoot?.addEventListener("change", this.handleChange);
        this.render();
        void this.loadCatalogue();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.handleClick);
        this.shadowRoot?.removeEventListener("input", this.handleInput);
        this.shadowRoot?.removeEventListener("change", this.handleChange);
    }

    private async loadCatalogue(): Promise<void> {
        await this.status.run(async () => {
            const response = await callCapability<EditorCatalogue>("editor-catalogue", {
                surface: this.getAttribute("surface") ?? "delivery",
            });
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
            const id = this.getAttribute("page-id");
            const revision = Number(this.getAttribute("revision"));
            if (!id || !Number.isSafeInteger(revision)) {
                throw new Error("The Page identity or revision is missing.");
            }
            await callCapability<PageUpdate>("update", {
                id,
                expectedRevision: revision,
                content: this.pageDocument.serialize(),
            });
            this.status.notice("Document saved. Reloading the Page…");
            location.reload();
        });
    }

    private changed(renderInspector = true): void {
        this.required<HTMLTextAreaElement>("[data-source]").value = this.pageDocument.serialize();
        this.required<HTMLIFrameElement>("[data-preview]").srcdoc = this.pageDocument.serialize();
        if (renderInspector) {
            this.render();
        }
        this.status.notice("Unsaved document changes.");
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
        const element = this.shadowRoot?.querySelector<T>(selector);
        if (!element) {
            throw new Error(`Missing Page editor element: ${selector}`);
        }
        return element;
    }
}
