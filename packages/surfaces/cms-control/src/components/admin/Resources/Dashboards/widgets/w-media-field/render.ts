import type { DashboardMediaItem } from "./types";

export function renderMediaTile(item: DashboardMediaItem, index: number): HTMLElement {
    const tile = document.createElement("article");
    tile.className = "media-tile";
    tile.draggable = true;
    tile.tabIndex = 0;
    tile.dataset.mediaTile = "";
    tile.dataset.index = String(index);
    tile.setAttribute("aria-label", "Replace media");
    const image = document.createElement("img");
    image.src = item.thumbnailUrl || item.url;
    image.alt = item.alt ?? "";
    tile.append(image, removeButton(index));
    return tile;
}

export function renderAddTile(): HTMLElement {
    const button = mediaButton("upload", undefined, "+");
    button.className = "add-tile";
    button.setAttribute("aria-label", "Add media");
    return button;
}

function removeButton(index: number): HTMLButtonElement {
    return mediaButton("remove", index, "x", true, "Remove media");
}

function mediaButton(
    action: string,
    index: number | undefined,
    label: string,
    danger = false,
    ariaLabel = label,
): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tile-action";
    button.dataset.mediaAction = action;
    if (index !== undefined) {
        button.dataset.index = String(index);
    }
    if (danger) {
        button.setAttribute("data-danger", "");
    }
    button.setAttribute("aria-label", ariaLabel);
    button.title = ariaLabel;
    button.textContent = label;
    return button;
}
