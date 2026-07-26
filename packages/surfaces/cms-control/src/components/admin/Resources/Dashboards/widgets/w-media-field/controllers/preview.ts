import type { DashboardMediaItem } from "../types";
import {
    mediaPreviewElements,
    mediaTitle,
    markImageError,
    markImageReady,
    type MediaPreviewElements,
    renderThumbnail,
    resetPreviewImage,
    thumbnailHasFocus,
} from "./previewView";

export class MediaPreviewController {
    private activeIndex = 0;
    private restoreFocus: HTMLElement | null = null;
    private readonly view: MediaPreviewElements;

    constructor(
        private readonly root: ShadowRoot,
        private readonly items: () => readonly DashboardMediaItem[],
    ) {
        this.view = mediaPreviewElements(root);
    }

    connect(): void {
        this.view.openButton.addEventListener("click", this.open);
        this.view.dialog.addEventListener("click", this.onDialogClick);
        this.view.dialog.addEventListener("keydown", this.onKeyDown);
        this.view.dialog.addEventListener("close", this.onClose);
        this.view.image.addEventListener("load", this.onImageLoad);
        this.view.image.addEventListener("error", this.onImageError);
        this.sync();
    }

    disconnect(): void {
        if (this.view.dialog.open) {
            this.view.dialog.close();
        }
        this.view.openButton.removeEventListener("click", this.open);
        this.view.dialog.removeEventListener("click", this.onDialogClick);
        this.view.dialog.removeEventListener("keydown", this.onKeyDown);
        this.view.dialog.removeEventListener("close", this.onClose);
        this.view.image.removeEventListener("load", this.onImageLoad);
        this.view.image.removeEventListener("error", this.onImageError);
    }

    sync(): void {
        const count = this.items().length;
        this.view.openButton.hidden = count === 0;
        if (!this.view.dialog.open) {
            return;
        }
        if (count === 0) {
            this.view.dialog.close();
            return;
        }
        this.activeIndex = Math.min(this.activeIndex, count - 1);
        this.render({ rebuildStrip: true, focusThumbnail: thumbnailHasFocus(this.root) });
    }

    private readonly open = (): void => {
        if (this.items().length === 0 || this.view.dialog.open) {
            return;
        }
        this.restoreFocus =
            this.root.activeElement instanceof HTMLElement ? this.root.activeElement : this.view.openButton;
        this.activeIndex = 0;
        this.render({ rebuildStrip: true });
        this.view.dialog.showModal();
        this.view.closeButton.focus();
    };

    private readonly onDialogClick = (event: MouseEvent): void => {
        if (event.target === this.view.dialog) {
            this.view.dialog.close();
            return;
        }
        const target = event.target as Element | null;
        const indexButton = target?.closest<HTMLButtonElement>("[data-preview-index]");
        if (indexButton) {
            this.setActive(Number(indexButton.dataset.previewIndex), true);
            return;
        }
        const action = target?.closest<HTMLButtonElement>("[data-preview-action]")?.dataset.previewAction;
        if (action === "close") {
            this.view.dialog.close();
        } else if (action === "previous") {
            this.move(-1);
        } else if (action === "next") {
            this.move(1);
        }
    };

    private readonly onKeyDown = (event: KeyboardEvent): void => {
        const keepThumbnailFocus = thumbnailHasFocus(this.root);
        if (event.key === "Escape") {
            event.preventDefault();
            this.view.dialog.close();
        } else if (event.key === "ArrowLeft") {
            event.preventDefault();
            this.move(-1, keepThumbnailFocus);
        } else if (event.key === "ArrowRight") {
            event.preventDefault();
            this.move(1, keepThumbnailFocus);
        } else if (event.key === "Home") {
            event.preventDefault();
            this.setActive(0, keepThumbnailFocus);
        } else if (event.key === "End") {
            event.preventDefault();
            this.setActive(this.items().length - 1, keepThumbnailFocus);
        }
    };

    private readonly onClose = (): void => {
        resetPreviewImage(this.view);
        this.restoreFocus?.focus();
        this.restoreFocus = null;
    };

    private readonly onImageLoad = (): void => markImageReady(this.view);
    private readonly onImageError = (): void => markImageError(this.view);

    private move(offset: number, focusThumbnail = false): void {
        const count = this.items().length;
        if (count > 1) {
            this.setActive((this.activeIndex + offset + count) % count, focusThumbnail);
        }
    }

    private setActive(index: number, focusThumbnail = false): void {
        if (!Number.isInteger(index) || index < 0 || index >= this.items().length) {
            return;
        }
        if (index === this.activeIndex) {
            if (focusThumbnail) {
                (this.view.strip.children[index] as HTMLButtonElement | undefined)?.focus();
            }
            return;
        }
        this.activeIndex = index;
        this.render({ focusThumbnail });
    }

    private render(options: { rebuildStrip?: boolean; focusThumbnail?: boolean } = {}): void {
        const items = this.items();
        const item = items[this.activeIndex];
        if (!item) {
            return;
        }
        const title = mediaTitle(item, this.activeIndex);
        if (this.view.image.getAttribute("src") !== item.url) {
            this.view.image.dataset.state = "loading";
            this.view.image.src = item.url;
            this.view.status.textContent = "Loading image…";
            this.view.status.hidden = false;
        }
        this.view.image.alt = item.alt?.trim() || title;
        this.view.caption.textContent = title;
        this.view.counter.textContent = `${this.activeIndex + 1} / ${items.length}`;
        this.view.previousButton.hidden = items.length < 2;
        this.view.nextButton.hidden = items.length < 2;
        this.view.strip.hidden = items.length < 2;
        if (options.rebuildStrip || this.view.strip.children.length !== items.length) {
            this.view.strip.replaceChildren(...items.map(renderThumbnail));
        }
        const previousThumbnail = this.view.strip.querySelector<HTMLButtonElement>('[aria-current="true"]');
        const activeThumbnail = this.view.strip.children[this.activeIndex] as HTMLButtonElement | undefined;
        if (previousThumbnail !== activeThumbnail) {
            previousThumbnail?.setAttribute("aria-current", "false");
            activeThumbnail?.setAttribute("aria-current", "true");
        }
        activeThumbnail?.scrollIntoView({
            block: "nearest",
            inline: "center",
        });
        if (options.focusThumbnail) {
            activeThumbnail?.focus();
        }
    }
}
