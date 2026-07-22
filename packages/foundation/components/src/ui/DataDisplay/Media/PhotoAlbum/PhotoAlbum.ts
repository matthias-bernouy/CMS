import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };
import albumCss from "./album.css" with { type: "text" };
import previewCss from "./preview.css" with { type: "text" };
import variantsCss from "./variants.css" with { type: "text" };
import { PhotoAlbumView } from "./PhotoAlbumView";

const css = [albumCss, previewCss, variantsCss].join("\n");

export class PhotoAlbum extends Component {
    private observer: MutationObserver | null = null;
    private activeIndex = 0;
    private readonly view: PhotoAlbumView;

    static get observedAttributes(): string[] {
        return ["view-legend"];
    }

    constructor() {
        super({ css, template: template as unknown as string });
        this.view = new PhotoAlbumView(this.shadowRoot!);
    }

    override connectedCallback(): void {
        this.view.slot.addEventListener("slotchange", this.syncImages);
        this.addEventListener("click", this.onHostClick);
        this.view.preview.addEventListener("click", this.onPreviewClick);
        this.view.strip.addEventListener("click", this.onStripClick);
        this.view.closeButton.addEventListener("click", this.closePreview);
        this.view.previousButton.addEventListener("click", this.showPrevious);
        this.view.nextButton.addEventListener("click", this.showNext);
        this.observer = new MutationObserver(this.syncImages);
        this.observer.observe(this, {
            attributes: true,
            childList: true,
            subtree: true,
            attributeFilter: ["src", "alt", "width", "height", "slot"],
        });
        this.syncImages();
    }

    disconnectedCallback(): void {
        this.view.slot.removeEventListener("slotchange", this.syncImages);
        this.removeEventListener("click", this.onHostClick);
        this.view.preview.removeEventListener("click", this.onPreviewClick);
        this.view.strip.removeEventListener("click", this.onStripClick);
        this.view.closeButton.removeEventListener("click", this.closePreview);
        this.view.previousButton.removeEventListener("click", this.showPrevious);
        this.view.nextButton.removeEventListener("click", this.showNext);
        document.removeEventListener("keydown", this.onKeyDown);
        this.observer?.disconnect();
        this.observer = null;
    }

    attributeChangedCallback(): void {
        this.syncImages();
    }

    private readonly syncImages = (): void => {
        const showLegend = this.hasAttribute("view-legend");
        this.view.syncAlbum(this.view.images(), showLegend);
        this.syncPreview();
    };

    private readonly onHostClick = (event: MouseEvent): void => {
        const images = this.view.images();
        const image = event.composedPath().find((target): target is HTMLImageElement => {
            return target instanceof HTMLImageElement && images.includes(target);
        });
        if (image) {
            this.openPreview(images.indexOf(image));
            return;
        }
        const button = previewButton(event);
        if (button) {
            this.openPreview(Number(button.dataset.previewIndex));
        }
    };

    private readonly onPreviewClick = (event: MouseEvent): void => {
        if (event.target === this.view.preview) {
            this.closePreview();
        }
    };

    private readonly onStripClick = (event: MouseEvent): void => {
        const button = previewButton(event);
        if (button) {
            this.setActiveIndex(Number(button.dataset.previewIndex));
        }
    };

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        if (this.view.preview.hidden) {
            return;
        }
        if (event.key === "Escape") {
            event.preventDefault();
            this.closePreview();
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            this.showPrevious();
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            this.showNext();
        }
    };

    private openPreview(index: number): void {
        if (!validIndex(index, this.view.images())) {
            return;
        }
        this.view.preview.hidden = false;
        document.addEventListener("keydown", this.onKeyDown);
        this.setActiveIndex(index);
        this.view.closeButton.focus();
    }

    private readonly closePreview = (): void => {
        this.view.preview.hidden = true;
        document.removeEventListener("keydown", this.onKeyDown);
    };

    private readonly showPrevious = (): void => this.move(-1);
    private readonly showNext = (): void => this.move(1);

    private move(offset: number): void {
        const count = this.view.images().length;
        if (count > 0) {
            this.setActiveIndex((this.activeIndex + offset + count) % count);
        }
    }

    private setActiveIndex(index: number): void {
        const images = this.view.images();
        if (!validIndex(index, images)) {
            return;
        }
        this.activeIndex = index;
        this.view.showActive(images, index, this.hasAttribute("view-legend"));
    }

    private syncPreview(): void {
        if (this.view.preview.hidden) {
            return;
        }
        const images = this.view.images();
        if (images.length === 0) {
            this.closePreview();
        } else {
            this.setActiveIndex(Math.min(this.activeIndex, images.length - 1));
        }
    }
}

function previewButton(event: MouseEvent): HTMLButtonElement | undefined {
    return event.composedPath().find((target): target is HTMLButtonElement => {
        return target instanceof HTMLButtonElement && target.dataset.previewIndex !== undefined;
    });
}

function validIndex(index: number, images: HTMLImageElement[]): boolean {
    return Number.isInteger(index) && index >= 0 && index < images.length;
}
