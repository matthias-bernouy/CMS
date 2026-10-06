import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class Bloc extends Component {
    private input: HTMLInputElement | null = null;
    private slotElement: HTMLSlotElement | null;
    private prompt: HTMLElement | null;
    private support: HTMLElement | null;
    private fileName: HTMLElement | null;
    private preview: HTMLElement | null;
    private cardPreview: HTMLElement | null;
    private cardActions: HTMLElement | null;
    private replaceButton: HTMLButtonElement;
    private removeButton: HTMLButtonElement;
    private root: Document | ShadowRoot | null = null;
    private previewUrls: string[] = [];
    private observer = new MutationObserver(() => this.sync());

    static get observedAttributes(): string[] {
        return ["button-label", "drop-label", "empty-label", "remove-label", "replace-label", "variant"];
    }

    constructor() {
        super({ css, template });
        this.slotElement = this.shadowRoot?.querySelector("slot") ?? null;
        this.prompt = this.shadowRoot?.querySelector('[part="prompt"]') ?? null;
        this.support = this.shadowRoot?.querySelector('[part="support"]') ?? null;
        this.fileName = this.shadowRoot?.querySelector('[part="file-name"]') ?? null;
        this.preview = this.shadowRoot?.querySelector('[part="preview"]') ?? null;
        this.cardPreview = this.shadowRoot?.querySelector('[part="card-preview"]') ?? null;
        this.cardActions = this.shadowRoot?.querySelector('[part="card-actions"]') ?? null;
        this.replaceButton = this.createAction("replace-shell", "replace");
        this.removeButton = this.createAction("remove-shell", "remove");
    }

    override connectedCallback(): void {
        this.slotElement?.addEventListener("slotchange", this.bindInput);
        this.root = this.getRootNode() as Document | ShadowRoot;
        this.root.addEventListener("reset", this.handleReset);
        this.addEventListener("dragenter", this.handleDragEnter);
        this.addEventListener("dragover", this.handleDragOver);
        this.addEventListener("dragleave", this.handleDragLeave);
        this.addEventListener("drop", this.handleDrop);
        this.replaceButton.addEventListener("click", this.replaceFile);
        this.removeButton.addEventListener("click", this.removeFile);
        this.bindInput();
    }

    disconnectedCallback(): void {
        this.slotElement?.removeEventListener("slotchange", this.bindInput);
        this.removeEventListener("dragenter", this.handleDragEnter);
        this.removeEventListener("dragover", this.handleDragOver);
        this.removeEventListener("dragleave", this.handleDragLeave);
        this.removeEventListener("drop", this.handleDrop);
        this.replaceButton.removeEventListener("click", this.replaceFile);
        this.removeButton.removeEventListener("click", this.removeFile);
        this.input?.removeEventListener("change", this.sync);
        this.root?.removeEventListener("reset", this.handleReset);
        this.root = null;
        this.observer.disconnect();
        this.clearPreviewUrls();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private bindInput = (): void => {
        this.input?.removeEventListener("change", this.sync);
        this.observer.disconnect();
        this.input = this.querySelector<HTMLInputElement>(':scope > input[type="file"]');
        this.input?.addEventListener("change", this.sync);
        if (this.input) {
            this.observer.observe(this.input, {
                attributes: true,
                attributeFilter: ["disabled", "aria-invalid"],
            });
        }
        this.sync();
    };

    private handleDragEnter = (): void => {
        if (!this.input?.disabled) {
            this.toggleAttribute("data-dragging", true);
        }
    };

    private handleDragLeave = (): void => {
        this.removeAttribute("data-dragging");
    };

    private handleDragOver = (event: DragEvent): void => {
        if (this.input?.disabled) {
            return;
        }
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "copy";
        }
    };

    private handleDrop = (event: DragEvent): void => {
        this.removeAttribute("data-dragging");
        if (this.input?.disabled || !event.dataTransfer?.files.length) {
            return;
        }
        event.preventDefault();
        this.input.files = event.dataTransfer.files;
        this.input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        queueMicrotask(this.sync);
    };

    private sync = (): void => {
        const files = this.input?.files ? Array.from(this.input.files) : [];
        if (this.prompt) {
            this.prompt.textContent = this.getAttribute("button-label") || "Choose a file";
        }
        if (this.support) {
            this.support.textContent = ` ${this.getAttribute("drop-label") || "or drag it here"}`;
        }
        if (this.fileName) {
            this.fileName.textContent = files.length
                ? files.map((file) => file.name).join(", ")
                : this.getAttribute("empty-label") || "No file selected";
        }
        this.replaceButton.textContent = this.getAttribute("replace-label") || "Replace";
        this.removeButton.textContent = this.getAttribute("remove-label") || "Remove";
        this.renderPreview(files);
        this.toggleAttribute("data-has-files", files.length > 0);
        this.toggleAttribute("data-disabled", this.input?.disabled === true);
        this.toggleAttribute("data-invalid", this.input?.getAttribute("aria-invalid") === "true");
    };

    private handleReset = (event: Event): void => {
        if (event.target !== this.input?.form) {
            return;
        }
        window.setTimeout(this.sync);
    };

    private renderPreview(files: File[]): void {
        if (!this.preview || !this.cardPreview || !this.cardActions) {
            return;
        }
        this.clearPreviewUrls();
        const cardVariant = this.getAttribute("variant") === "card";
        const cardFile = cardVariant ? files.at(0) : undefined;
        this.cardPreview.replaceChildren(...(cardFile ? [this.createPreviewCard(cardFile, true)] : []));
        this.cardPreview.toggleAttribute("hidden", !cardFile);
        this.cardActions.toggleAttribute("hidden", !cardFile);
        this.preview.replaceChildren(...(cardVariant ? [] : files.map((file) => this.createPreviewCard(file, false))));
        this.preview.toggleAttribute("hidden", cardVariant || files.length === 0);
    }

    private createPreviewCard(file: File, cardPreview: boolean): HTMLElement {
        const card = document.createElement("span");
        card.setAttribute("part", cardPreview ? "preview-card card-preview-card" : "preview-card");
        if (file.type.startsWith("image/")) {
            const image = document.createElement("img");
            image.src = this.createPreviewUrl(file);
            image.alt = `Preview of ${file.name}`;
            image.setAttribute("part", "preview-media");
            card.append(image);
        } else if (file.type === "application/pdf") {
            const preview = document.createElement("object");
            preview.data = this.createPreviewUrl(file);
            preview.type = file.type;
            preview.setAttribute("aria-label", `Preview of ${file.name}`);
            preview.setAttribute("part", "preview-media");
            card.append(preview);
        } else {
            const generic = document.createElement("span");
            generic.textContent = this.extensionFor(file.name);
            generic.setAttribute("part", "preview-generic");
            card.append(generic);
        }
        const copy = document.createElement("span");
        copy.setAttribute("part", "preview-copy");
        const name = document.createElement("span");
        name.textContent = file.name;
        name.title = file.name;
        name.setAttribute("part", "preview-name");
        const meta = document.createElement("span");
        meta.textContent = `${this.extensionFor(file.name)} · ${this.formatSize(file.size)}`;
        meta.setAttribute("part", "preview-meta");
        copy.append(name, meta);
        card.append(copy);
        return card;
    }

    private replaceFile = (): void => {
        if (!this.input?.disabled) {
            this.input?.click();
        }
    };

    private removeFile = (): void => {
        if (!this.input || this.input.disabled) {
            return;
        }
        this.input.value = "";
        this.input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        this.input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        this.sync();
    };

    private createAction(shellPart: string, part: string): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("part", part);
        this.shadowRoot?.querySelector(`[part="${shellPart}"]`)?.append(button);
        return button;
    }

    private createPreviewUrl(file: File): string {
        const url = URL.createObjectURL(file);
        this.previewUrls.push(url);
        return url;
    }

    private clearPreviewUrls(): void {
        this.previewUrls.forEach((url) => URL.revokeObjectURL(url));
        this.previewUrls = [];
    }

    private extensionFor(name: string): string {
        const extension = name.split(".").pop()?.trim();
        return extension && extension !== name ? extension : "File";
    }

    private formatSize(size: number): string {
        if (size < 1024) {
            return `${size} B`;
        }
        if (size < 1024 * 1024) {
            return `${Math.round(size / 102.4) / 10} KB`;
        }
        return `${Math.round(size / 1024 / 102.4) / 10} MB`;
    }
}
