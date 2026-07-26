import type { DashboardMediaItem } from "../types";

export type MediaPreviewElements = ReturnType<typeof mediaPreviewElements>;

export function mediaPreviewElements(root: ShadowRoot) {
    return {
        openButton: query<HTMLButtonElement>(root, "[data-preview-open]"),
        dialog: query<HTMLDialogElement>(root, "[data-preview-dialog]"),
        closeButton: query<HTMLButtonElement>(root, "[data-preview-action='close']"),
        previousButton: query<HTMLButtonElement>(root, "[data-preview-action='previous']"),
        nextButton: query<HTMLButtonElement>(root, "[data-preview-action='next']"),
        image: query<HTMLImageElement>(root, "[data-preview-image]"),
        caption: query<HTMLElement>(root, "[data-preview-caption]"),
        counter: query<HTMLElement>(root, "[data-preview-counter]"),
        status: query<HTMLElement>(root, "[data-preview-status]"),
        strip: query<HTMLElement>(root, "[data-preview-strip]"),
    };
}

export function markImageReady(view: MediaPreviewElements): void {
    view.image.dataset.state = "ready";
    view.status.hidden = true;
}

export function markImageError(view: MediaPreviewElements): void {
    view.image.dataset.state = "error";
    view.status.textContent = "Unable to load this image.";
    view.status.hidden = false;
}

export function resetPreviewImage(view: MediaPreviewElements): void {
    view.image.removeAttribute("src");
    delete view.image.dataset.state;
    view.image.alt = "";
    view.status.hidden = true;
}

export function renderThumbnail(item: DashboardMediaItem, index: number): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preview-thumb";
    button.dataset.previewIndex = String(index);
    button.setAttribute("aria-current", "false");
    button.ariaLabel = mediaTitle(item, index);

    const image = document.createElement("img");
    image.src = item.thumbnailUrl || item.url;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    button.append(image);
    return button;
}

export function mediaTitle(item: DashboardMediaItem, index: number): string {
    return item.name?.trim() || item.alt?.trim() || `Image ${index + 1}`;
}

export function thumbnailHasFocus(root: ShadowRoot): boolean {
    return root.activeElement instanceof HTMLButtonElement && root.activeElement.dataset.previewIndex !== undefined;
}

function query<T extends Element>(root: ShadowRoot, selector: string): T {
    return root.querySelector(selector) as T;
}
