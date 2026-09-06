import type { PageRef } from "../pageLinkDomain";
import { renderPageLinkPanels } from "../View/pageLinkMediaView";
import { renderPageLinkPages, renderPageLinkSummary, renderPageLinkTabs } from "../View/pageLinkNavigationView";
import { PageLinkState } from "./PageLinkState";

export class PageLinkController extends PageLinkState {
    constructor(template: HTMLTemplateElement) {
        super(template);
    }

    connectedCallback(): void {
        this.syncFromAttributes();
        this.wire();
        void this.loadPages();
        this.render();
    }

    protected render(): void {
        this.elements.label.textContent = this.getAttribute("label") ?? "Link";
        this.elements.hint.textContent = this.getAttribute("hint") ?? "";
        this.elements.hint.toggleAttribute("hidden", !this.elements.hint.textContent);
        this.renderTabs();
        this.renderPanels();
        this.renderPages();
        this.renderSummary();
    }

    protected renderPages(): void {
        renderPageLinkPages({
            disabled: this.disabled,
            elements: this.elements,
            onSelect: (value) => {
                this.setValue(value);
                this.elements.searchInput.value = "";
                this.closePicker();
            },
            pages: this.pages,
            pickerOpen: this.pickerOpen,
            query: this.elements.searchInput.value,
            value: this.currentValue,
        });
    }

    protected renderSummary(): void {
        renderPageLinkSummary(this.elements, this.pages, this.mode, this.currentValue);
    }

    private wire(): void {
        if (this.wired) {
            return;
        }
        this.wired = true;
        this.elements.searchInput.addEventListener("focus", () => this.openPicker());
        this.elements.searchInput.addEventListener("click", () => this.openPicker());
        this.elements.searchInput.addEventListener("input", () => {
            this.pickerOpen = true;
            this.renderPages();
        });
        this.elements.externalInput.addEventListener("input", () => {
            if (!this.disabled) {
                this.setValue(this.elements.externalInput.value);
            }
        });
        this.elements.fileButton.addEventListener("click", () => this.openFilesCenter());
        this.elements.pagePanel.addEventListener("focusout", () => {
            setTimeout(() => {
                if (this.shadowRoot?.activeElement && this.elements.pagePanel.contains(this.shadowRoot.activeElement)) {
                    return;
                }
                this.closePicker();
            }, 0);
        });
        this.elements.target.addEventListener("click", () => {
            if (!this.disabled && this.mode === "page") {
                this.elements.searchInput.focus();
                this.openPicker();
            }
        });
    }

    private async loadPages(): Promise<void> {
        if (this.loaded || !this.allowPage()) {
            return;
        }
        this.loaded = true;
        try {
            const published = this.getAttribute("published-only") === "true" ? "?visible=published" : "";
            const response = await fetch(`${this.basePath()}/api/page/links${published}`);
            if (!response.ok) {
                return;
            }
            this.pages = (await response.json()) as PageRef[];
            this.renderPages();
            this.renderSummary();
        } catch {
            this.pages = [];
            this.renderPages();
        }
    }

    private renderTabs(): void {
        renderPageLinkTabs({
            allowedModes: this.allowedModes(),
            disabled: this.disabled,
            elements: this.elements,
            mode: this.mode,
            onMode: (mode) => {
                this.mode = mode;
                if (mode !== "page") {
                    this.pickerOpen = false;
                }
                if (mode === "external") {
                    this.elements.externalInput.value = this.currentValue;
                }
                this.render();
            },
        });
    }

    private renderPanels(): void {
        renderPageLinkPanels({
            allowExternal: this.allowExternal(),
            allowMedia: this.allowMedia(),
            allowPage: this.allowPage(),
            disabled: this.disabled,
            elements: this.elements,
            mediaLabel: this.mediaLabel,
            mode: this.mode,
            pickerOpen: this.pickerOpen,
            value: this.currentValue,
        });
    }
}
