import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };
import { FilesCenter, type FilesCenterSelectDetail } from "../FilesCenter/FilesCenter";
import {
    allowedLinkModes,
    isImageMediaLink,
    linkSummaryFallback,
    mediaDisplayName,
    mediaSelectionLabel,
    modeForLinkValue,
    type LinkMode,
    type PageRef,
} from "./pageLinkDomain";

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type PageLinkInputDetail = {
    value: string;
};

export class PageLink extends HTMLElement {
    private _pages: PageRef[] = [];
    private _mode: LinkMode = "page";
    private _value = "";
    private _loaded = false;
    private _wired = false;
    private _pickerOpen = false;
    private _isReflectingValue = false;
    private _mediaLabel = "";

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this._syncFromAttributes();
        this._wire();
        void this._loadPages();
        this._render();
    }

    static get observedAttributes(): string[] {
        return ["label", "hint", "value", "allow-page", "allow-external", "allow-media", "disabled"];
    }

    attributeChangedCallback(): void {
        if (!this.shadowRoot) return;
        if (this._isReflectingValue) return;
        this._syncFromAttributes();
        this._render();
    }

    get value(): string {
        return this._value;
    }

    set value(value: string) {
        this._value = value;
        this._reflectValue(value);
        this._render();
    }

    private _syncFromAttributes(): void {
        this._value = this.getAttribute("value") ?? "";
        this._mode = modeForLinkValue(this._value, this._modeOptions());
    }

    private _wire(): void {
        if (this._wired) return;
        this._wired = true;

        this.searchInput.addEventListener("focus", () => this._openPicker());
        this.searchInput.addEventListener("click", () => this._openPicker());
        this.searchInput.addEventListener("input", () => {
            this._pickerOpen = true;
            this._renderPages();
        });
        this.externalInput.addEventListener("input", () => {
            if (this.disabled) return;
            this._setValue(this.externalInput.value);
        });
        this.fileButton.addEventListener("click", () => this._openFilesCenter());
        this.pagePanel.addEventListener("focusout", () => {
            setTimeout(() => {
                if (this.shadowRoot?.activeElement && this.pagePanel.contains(this.shadowRoot.activeElement)) return;
                this._closePicker();
            }, 0);
        });
        this.target.addEventListener("click", () => {
            if (this.disabled || this._mode !== "page") return;
            this.searchInput.focus();
            this._openPicker();
        });
    }

    private async _loadPages(): Promise<void> {
        if (this._loaded || !this._allowPage()) return;
        this._loaded = true;

        try {
            const response = await fetch(`${this._basePath()}/api/page/links`);
            if (!response.ok) return;
            this._pages = await response.json() as PageRef[];
            this._renderPages();
            this._renderSummary();
        } catch {
            this._pages = [];
            this._renderPages();
        }
    }

    private _render(): void {
        this.label.textContent = this.getAttribute("label") ?? "Link";
        this.hint.textContent = this.getAttribute("hint") ?? "";
        this.hint.toggleAttribute("hidden", !this.hint.textContent);

        this._renderTabs();
        this._renderPanels();
        this._renderPages();
        this._renderSummary();
    }

    private _renderTabs(): void {
        this.tabs.replaceChildren();

        if (this._allowedModes().length <= 1) {
            this.tabs.hidden = true;
            return;
        }

        this.tabs.hidden = false;
        if (this._allowPage()) {
            this.tabs.append(this._tab("Page", "page"));
        }
        if (this._allowExternal()) {
            this.tabs.append(this._tab("External", "external"));
        }
        if (this._allowMedia()) {
            this.tabs.append(this._tab("Media", "media"));
        }
    }

    private _tab(label: string, mode: LinkMode): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.role = "tab";
        button.textContent = label;
        button.ariaSelected = String(this._mode === mode);
        button.disabled = this.disabled;
        button.addEventListener("click", () => {
            if (this.disabled) return;
            this._mode = mode;
            if (mode !== "page") this._pickerOpen = false;
            if (mode === "external") this.externalInput.value = this._value;
            this._render();
        });
        return button;
    }

    private _renderPanels(): void {
        this.pagePanel.hidden = this._mode !== "page" || !this._allowPage();
        this.externalPanel.hidden = this._mode !== "external" || !this._allowExternal();
        this.mediaPanel.hidden = this._mode !== "media" || !this._allowMedia();
        this.searchInput.disabled = this.disabled;
        this.externalInput.disabled = this.disabled;
        this.fileButton.disabled = this.disabled;
        this.picker.hidden = !this._pickerOpen || this.pagePanel.hidden;
        if (this._mode === "external") this.externalInput.value = this._value;
        this._renderMediaFile();
    }

    private _renderPages(): void {
        this.pageList.replaceChildren();
        this.picker.hidden = !this._pickerOpen || this.pagePanel.hidden;

        const query = this.searchInput.value.trim().toLowerCase();
        const pages = this._pages.filter(page => {
            if (!query) return true;
            return page.title.toLowerCase().includes(query) || page.path.toLowerCase().includes(query);
        });

        this.empty.hidden = !this._pickerOpen || pages.length > 0;

        for (const page of pages) {
            const button = document.createElement("button");
            button.className = "page-option";
            button.type = "button";
            button.ariaSelected = String(page.path === this._value);
            button.disabled = this.disabled;
            button.addEventListener("click", () => {
                if (this.disabled) return;
                this._setValue(page.path);
                this.searchInput.value = "";
                this._closePicker();
            });

            const title = document.createElement("span");
            title.className = "page-title";
            title.textContent = page.title;

            const path = document.createElement("span");
            path.className = "page-path";
            path.textContent = page.path;

            button.append(title, path);
            this.pageList.append(button);
        }
    }

    private _renderSummary(): void {
        const page = this._pages.find(candidate => candidate.path === this._value);
        this.summaryTitle.textContent = page?.title ?? (this._value ? linkSummaryFallback(this._mode) : "No link selected");
        this.summaryValue.textContent = this._value || "Choose a target";
        this.target.hidden = !this._value || this._mode === "media";
    }

    private _setValue(value: string): void {
        this._value = value;
        this._reflectValue(value);
        this._renderPages();
        this._renderSummary();
        this._renderMediaFile();
        this.dispatchEvent(new CustomEvent<PageLinkInputDetail>("input", {
            bubbles: true,
            composed: true,
            detail: { value },
        }));
    }

    private _openPicker(): void {
        if (this.disabled || this._mode !== "page") return;
        this._pickerOpen = true;
        this._renderPages();
    }

    private _closePicker(): void {
        this._pickerOpen = false;
        this._renderPages();
    }

    private _openFilesCenter(): void {
        if (this.disabled) return;

        const center = new FilesCenter();
        const cleanup = () => center.remove();
        center.addEventListener("close", cleanup, { once: true });
        center.addEventListener("select-file", (event) => {
            const detail = (event as CustomEvent<FilesCenterSelectDetail>).detail;
            if (!detail?.src) return;
            this._mode = "media";
            this._mediaLabel = detail.label;
            this._setValue(detail.src);
        }, { once: true });

        document.body.append(center);
        center.show({ accept: ["folder", "file"] });
    }

    private _renderMediaFile(): void {
        const title = this.fileTitle;
        const value = this.fileValue;
        const preview = this.filePreview;
        const action = this.fileAction;
        const hasValue = this._mode === "media" && this._value !== "";
        const isImage = hasValue && isImageMediaLink(this._value);

        title.textContent = hasValue ? mediaDisplayName(this._value, isImage, this._mediaLabel) : "Choose file";
        value.textContent = hasValue ? mediaSelectionLabel(isImage) : "No file selected";
        value.toggleAttribute("hidden", hasValue && isImage);
        action.textContent = hasValue ? "Change" : "Choose";

        preview.replaceChildren();
        preview.dataset.kind = isImage ? "image" : "file";

        if (isImage) {
            const image = document.createElement("img");
            image.src = this._value;
            image.alt = "";
            image.loading = "lazy";
            preview.append(image);
            return;
        }

        preview.textContent = "↗";
    }

    private _reflectValue(value: string): void {
        this._isReflectingValue = true;
        this.setAttribute("value", value);
        this._isReflectingValue = false;
    }

    private _allowPage(): boolean {
        return this.getAttribute("allow-page") !== "false";
    }

    private _allowExternal(): boolean {
        return this.getAttribute("allow-external") !== "false";
    }

    private _allowMedia(): boolean {
        return this.getAttribute("allow-media") !== "false";
    }

    private _allowedModes(): LinkMode[] {
        return allowedLinkModes(this._modeOptions());
    }

    private _modeOptions() {
        return {
            allowPage:     this._allowPage(),
            allowExternal: this._allowExternal(),
            allowMedia:    this._allowMedia(),
        };
    }

    private _basePath(): string {
        return document.querySelector<HTMLMetaElement>('meta[name="basePath"]')?.content ?? "";
    }

    private get disabled(): boolean {
        return this.hasAttribute("disabled");
    }

    private get label(): HTMLElement {
        return this.shadowRoot!.querySelector(".label")!;
    }

    private get hint(): HTMLElement {
        return this.shadowRoot!.querySelector(".hint")!;
    }

    private get tabs(): HTMLElement {
        return this.shadowRoot!.querySelector(".tabs")!;
    }

    private get pagePanel(): HTMLElement {
        return this.shadowRoot!.querySelector(".page-panel")!;
    }

    private get externalPanel(): HTMLElement {
        return this.shadowRoot!.querySelector(".external-panel")!;
    }

    private get mediaPanel(): HTMLElement {
        return this.shadowRoot!.querySelector(".media-panel")!;
    }

    private get searchInput(): HTMLInputElement {
        return this.shadowRoot!.querySelector(".search")!;
    }

    private get externalInput(): HTMLInputElement {
        return this.shadowRoot!.querySelector(".external-input")!;
    }

    private get fileButton(): HTMLButtonElement {
        return this.shadowRoot!.querySelector(".file-button")!;
    }

    private get filePreview(): HTMLElement {
        return this.shadowRoot!.querySelector(".file-preview")!;
    }

    private get fileTitle(): HTMLElement {
        return this.shadowRoot!.querySelector(".file-title")!;
    }

    private get fileValue(): HTMLElement {
        return this.shadowRoot!.querySelector(".file-value")!;
    }

    private get fileAction(): HTMLElement {
        return this.shadowRoot!.querySelector(".file-action")!;
    }

    private get pageList(): HTMLElement {
        return this.shadowRoot!.querySelector(".page-list")!;
    }

    private get picker(): HTMLElement {
        return this.shadowRoot!.querySelector(".picker")!;
    }

    private get empty(): HTMLElement {
        return this.shadowRoot!.querySelector(".empty")!;
    }

    private get summaryTitle(): HTMLElement {
        return this.shadowRoot!.querySelector(".target strong")!;
    }

    private get summaryValue(): HTMLElement {
        return this.shadowRoot!.querySelector(".target code")!;
    }

    private get target(): HTMLElement {
        return this.shadowRoot!.querySelector(".target")!;
    }
}

if (!customElements.get("cms-editor-v2-page-link")) {
    customElements.define("cms-editor-v2-page-link", PageLink);
}
