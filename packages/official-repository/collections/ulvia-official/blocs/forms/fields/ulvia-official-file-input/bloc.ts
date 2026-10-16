import { BlocBehavior } from "@bernouy/cms-content/browser";

export class Bloc extends BlocBehavior {
    private input: HTMLInputElement | null = null;
    private emptyState: HTMLElement | null = null;
    private fileName: HTMLOutputElement | null = null;
    private preview: HTMLElement | null;
    private cardPreview: HTMLElement | null;
    private cardActions: HTMLElement | null;
    private replaceButton: HTMLButtonElement | null = null;
    private removeButton: HTMLButtonElement | null = null;
    private root: Document | null = null;
    private previewUrls: string[] = [];
    private observer = new MutationObserver(() => this.sync());

    static get observedAttributes(): string[] {
        return ["variant"];
    }

    constructor(root: HTMLElement) {
        super(root);
        this.preview = this?.querySelector('[part="preview"]') ?? null;
        this.cardPreview = this?.querySelector('[part="card-preview"]') ?? null;
        this.cardActions = this?.querySelector('[part="card-actions"]') ?? null;
    }

    override connectedCallback(): void {
        this.root = this.ownerDocument;
        this.root.addEventListener("reset", this.handleReset);
        this.addEventListener("dragenter", this.handleDragEnter);
        this.addEventListener("dragover", this.handleDragOver);
        this.addEventListener("dragleave", this.handleDragLeave);
        this.addEventListener("drop", this.handleDrop);
        this.emptyState = this.querySelector<HTMLElement>("[data-file-empty-state]");
        this.fileName = this.querySelector<HTMLOutputElement>("[data-file-name]");
        this.replaceButton = this.querySelector<HTMLButtonElement>("[data-file-replace]");
        this.removeButton = this.querySelector<HTMLButtonElement>("[data-file-remove]");
        this.replaceButton?.addEventListener("click", this.replaceFile);
        this.removeButton?.addEventListener("click", this.removeFile);
        this.bindInput();
    }

    disconnectedCallback(): void {
        this.removeEventListener("dragenter", this.handleDragEnter);
        this.removeEventListener("dragover", this.handleDragOver);
        this.removeEventListener("dragleave", this.handleDragLeave);
        this.removeEventListener("drop", this.handleDrop);
        this.replaceButton?.removeEventListener("click", this.replaceFile);
        this.removeButton?.removeEventListener("click", this.removeFile);
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
        this.input = this.querySelector<HTMLInputElement>('input[type="file"]');
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
        if (this.fileName) {
            this.fileName.textContent = files.map((file) => file.name).join(", ");
            this.fileName.toggleAttribute("hidden", files.length === 0);
        }
        this.emptyState?.toggleAttribute("hidden", files.length > 0);
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
            image.alt = file.name;
            image.setAttribute("part", "preview-media");
            card.append(image);
        } else if (file.type === "application/pdf") {
            const preview = document.createElement("object");
            preview.data = this.createPreviewUrl(file);
            preview.type = file.type;
            preview.setAttribute("aria-label", file.name);
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
        return extension && extension !== name ? extension : "—";
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
