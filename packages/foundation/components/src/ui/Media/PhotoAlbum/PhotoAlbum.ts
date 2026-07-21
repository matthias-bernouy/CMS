import { Component } from "@bernouy/components/base";

import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

export class PhotoAlbum extends Component {
    private _observer: MutationObserver | null = null;
    private _activeIndex = 0;

    static get observedAttributes(): string[] {
        return ["view-legend"];
    }

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._slot.addEventListener("slotchange", this._syncImages);
        this.addEventListener("click", this._onHostClick);
        this._preview.addEventListener("click", this._onPreviewClick);
        this._strip.addEventListener("click", this._onStripClick);
        this._closeButton.addEventListener("click", this._closePreview);
        this._prevButton.addEventListener("click", this._showPrevious);
        this._nextButton.addEventListener("click", this._showNext);

        this._observer = new MutationObserver(this._syncImages);
        this._observer.observe(this, {
            attributes: true,
            childList: true,
            subtree: true,
            attributeFilter: ["src", "alt", "width", "height", "slot"],
        });
        this._syncImages();
    }

    disconnectedCallback(): void {
        this._slot.removeEventListener("slotchange", this._syncImages);
        this.removeEventListener("click", this._onHostClick);
        this._preview.removeEventListener("click", this._onPreviewClick);
        this._strip.removeEventListener("click", this._onStripClick);
        this._closeButton.removeEventListener("click", this._closePreview);
        this._prevButton.removeEventListener("click", this._showPrevious);
        this._nextButton.removeEventListener("click", this._showNext);
        document.removeEventListener("keydown", this._onKeyDown);
        this._observer?.disconnect();
        this._observer = null;
    }

    attributeChangedCallback(): void {
        this._syncImages();
    }

    private readonly _syncImages = (): void => {
        const enabled = this.hasAttribute("view-legend");
        this._album.hidden = enabled;
        this._legendAlbum.hidden = !enabled;

        if (!enabled) {
            this._legendAlbum.replaceChildren();
            this._syncPreview();
            return;
        }

        const figures = this._images.map((image, index) => this._figureFor(image, index));
        this._legendAlbum.replaceChildren(...figures);
        this._syncPreview();
    };

    private _figureFor(source: HTMLImageElement, index: number): HTMLElement {
        const figure = document.createElement("figure");
        figure.className = "figure";
        figure.setAttribute("part", "figure");

        const trigger = document.createElement("button");
        trigger.className = "figure-trigger";
        trigger.type = "button";
        trigger.dataset.previewIndex = String(index);
        trigger.ariaLabel = source.alt.trim() || "Open image";

        const image = document.createElement("img");
        image.src = source.currentSrc || source.src;
        image.alt = source.alt;
        image.loading = source.loading || "lazy";
        if (source.width > 0) {
            image.width = source.width;
        }
        if (source.height > 0) {
            image.height = source.height;
        }

        const caption = document.createElement("figcaption");
        caption.setAttribute("part", "legend");
        caption.textContent = source.alt;
        caption.hidden = source.alt.trim() === "";

        trigger.append(image);
        figure.append(trigger, caption);
        return figure;
    }

    private readonly _onHostClick = (event: MouseEvent): void => {
        const images = this._images;
        const targetImage = event.composedPath().find((target): target is HTMLImageElement => {
            return target instanceof HTMLImageElement && images.includes(target);
        });

        if (targetImage) {
            this._openPreview(images.indexOf(targetImage));
            return;
        }

        const targetButton = event.composedPath().find((target): target is HTMLButtonElement => {
            return target instanceof HTMLButtonElement && target.dataset.previewIndex !== undefined;
        });
        if (!targetButton) {
            return;
        }

        this._openPreview(Number(targetButton.dataset.previewIndex));
    };

    private readonly _onPreviewClick = (event: MouseEvent): void => {
        if (event.target === this._preview) {
            this._closePreview();
        }
    };

    private readonly _onStripClick = (event: MouseEvent): void => {
        const button = event.composedPath().find((target): target is HTMLButtonElement => {
            return target instanceof HTMLButtonElement && target.dataset.previewIndex !== undefined;
        });
        if (!button) {
            return;
        }

        this._setActiveIndex(Number(button.dataset.previewIndex));
    };

    private readonly _onKeyDown = (event: KeyboardEvent): void => {
        if (this._preview.hidden) {
            return;
        }

        if (event.key === "Escape") {
            event.preventDefault();
            this._closePreview();
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            this._showPrevious();
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            this._showNext();
        }
    };

    private _openPreview(index: number): void {
        if (!Number.isInteger(index) || index < 0 || index >= this._images.length) {
            return;
        }

        this._preview.hidden = false;
        document.addEventListener("keydown", this._onKeyDown);
        this._setActiveIndex(index);
        this._closeButton.focus();
    }

    private readonly _closePreview = (): void => {
        this._preview.hidden = true;
        document.removeEventListener("keydown", this._onKeyDown);
    };

    private readonly _showPrevious = (): void => {
        const count = this._images.length;
        if (count === 0) {
            return;
        }
        this._setActiveIndex((this._activeIndex - 1 + count) % count);
    };

    private readonly _showNext = (): void => {
        const count = this._images.length;
        if (count === 0) {
            return;
        }
        this._setActiveIndex((this._activeIndex + 1) % count);
    };

    private _setActiveIndex(index: number): void {
        const images = this._images;
        if (!Number.isInteger(index) || index < 0 || index >= images.length) {
            return;
        }

        this._activeIndex = index;
        const source = images[index]!;
        this._previewImage.src = source.currentSrc || source.src;
        this._previewImage.alt = source.alt;
        this._caption.textContent = source.alt;
        this._caption.hidden = !this.hasAttribute("view-legend") || source.alt.trim() === "";
        this._prevButton.hidden = images.length < 2;
        this._nextButton.hidden = images.length < 2;
        this._syncStrip();
    }

    private _syncPreview(): void {
        if (this._preview.hidden) {
            return;
        }
        if (this._images.length === 0) {
            this._closePreview();
            return;
        }

        this._setActiveIndex(Math.min(this._activeIndex, this._images.length - 1));
    }

    private _syncStrip(): void {
        const buttons = this._images.map((source, index) => {
            const button = document.createElement("button");
            button.className = "preview-thumb";
            button.type = "button";
            button.dataset.previewIndex = String(index);
            button.ariaSelected = index === this._activeIndex ? "true" : "false";
            button.setAttribute("role", "option");
            button.ariaLabel = source.alt.trim() || `Image ${index + 1}`;

            const image = document.createElement("img");
            image.src = source.currentSrc || source.src;
            image.alt = "";
            image.loading = source.loading || "lazy";
            button.append(image);
            return button;
        });

        this._strip.replaceChildren(...buttons);
        this._strip.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.scrollIntoView({
            block: "nearest",
            inline: "center",
        });
    }

    private get _images(): HTMLImageElement[] {
        return this._slot
            .assignedElements({ flatten: true })
            .filter((element): element is HTMLImageElement => element instanceof HTMLImageElement);
    }

    private get _slot(): HTMLSlotElement {
        return this.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="images"]')!;
    }

    private get _album(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>(".album")!;
    }

    private get _legendAlbum(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>(".legend-album")!;
    }

    private get _preview(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>(".preview")!;
    }

    private get _previewImage(): HTMLImageElement {
        return this.shadowRoot!.querySelector<HTMLImageElement>(".preview-image")!;
    }

    private get _caption(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>(".preview-caption")!;
    }

    private get _strip(): HTMLElement {
        return this.shadowRoot!.querySelector<HTMLElement>(".preview-strip")!;
    }

    private get _closeButton(): HTMLButtonElement {
        return this.shadowRoot!.querySelector<HTMLButtonElement>(".preview-close")!;
    }

    private get _prevButton(): HTMLButtonElement {
        return this.shadowRoot!.querySelector<HTMLButtonElement>(".preview-prev")!;
    }

    private get _nextButton(): HTMLButtonElement {
        return this.shadowRoot!.querySelector<HTMLButtonElement>(".preview-next")!;
    }
}
