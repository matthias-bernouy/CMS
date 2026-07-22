import { allowedLinkModes, modeForLinkValue, type LinkMode, type PageRef } from "../pageLinkDomain";
import { type PageLinkElements, queryPageLinkElements } from "../View/pageLinkElements";
import { renderPageLinkMedia } from "../View/pageLinkMediaView";
import { openPageLinkMediaPicker } from "../pageLinkMediaPicker";

export abstract class PageLinkState extends HTMLElement {
    protected pages: PageRef[] = [];
    protected mode: LinkMode = "page";
    protected currentValue = "";
    protected loaded = false;
    protected wired = false;
    protected pickerOpen = false;
    protected reflectingValue = false;
    protected mediaLabel = "";
    protected readonly elements: PageLinkElements;

    constructor(template: HTMLTemplateElement) {
        super();
        const shadowRoot = this.attachShadow({ mode: "open" });
        shadowRoot.append(template.content.cloneNode(true));
        this.elements = queryPageLinkElements(shadowRoot);
    }

    static get observedAttributes(): string[] {
        return ["label", "hint", "value", "allow-page", "allow-external", "allow-media", "disabled"];
    }

    attributeChangedCallback(): void {
        if (!this.shadowRoot || this.reflectingValue) {
            return;
        }
        this.syncFromAttributes();
        this.render();
    }

    get value(): string {
        return this.currentValue;
    }

    set value(value: string) {
        this.currentValue = value;
        this.reflectValue(value);
        this.render();
    }

    protected syncFromAttributes(): void {
        this.currentValue = this.getAttribute("value") ?? "";
        this.mode = modeForLinkValue(this.currentValue, this.modeOptions());
    }

    protected setValue(value: string): void {
        this.currentValue = value;
        this.reflectValue(value);
        this.renderPages();
        this.renderSummary();
        this.renderMediaFile();
        this.dispatchEvent(
            new CustomEvent("input", {
                bubbles: true,
                composed: true,
                detail: { value },
            }),
        );
    }

    protected openPicker(): void {
        if (this.disabled || this.mode !== "page") {
            return;
        }
        this.pickerOpen = true;
        this.renderPages();
    }

    protected closePicker(): void {
        this.pickerOpen = false;
        this.renderPages();
    }

    protected openFilesCenter(): void {
        if (this.disabled) {
            return;
        }
        openPageLinkMediaPicker((source, label) => {
            this.mode = "media";
            this.mediaLabel = label;
            this.setValue(source);
        });
    }

    protected renderMediaFile(): void {
        renderPageLinkMedia(this.elements, this.mode, this.currentValue, this.mediaLabel);
    }

    protected allowedModes(): LinkMode[] {
        return allowedLinkModes(this.modeOptions());
    }

    protected allowPage(): boolean {
        return this.getAttribute("allow-page") !== "false";
    }

    protected allowExternal(): boolean {
        return this.getAttribute("allow-external") !== "false";
    }

    protected allowMedia(): boolean {
        return this.getAttribute("allow-media") !== "false";
    }

    protected basePath(): string {
        return document.querySelector<HTMLMetaElement>('meta[name="basePath"]')?.content ?? "";
    }

    protected get disabled(): boolean {
        return this.hasAttribute("disabled");
    }

    private modeOptions() {
        return {
            allowPage: this.allowPage(),
            allowExternal: this.allowExternal(),
            allowMedia: this.allowMedia(),
        };
    }

    private reflectValue(value: string): void {
        this.reflectingValue = true;
        this.setAttribute("value", value);
        this.reflectingValue = false;
    }

    protected abstract render(): void;
    protected abstract renderPages(): void;
    protected abstract renderSummary(): void;
}
