import { isImageMediaLink, mediaDisplayName, mediaSelectionLabel, type LinkMode } from "../pageLinkDomain";
import type { PageLinkElements } from "./pageLinkElements";

export function renderPageLinkPanels(input: {
    allowExternal: boolean;
    allowMedia: boolean;
    allowPage: boolean;
    disabled: boolean;
    elements: PageLinkElements;
    mediaLabel: string;
    mode: LinkMode;
    pickerOpen: boolean;
    value: string;
}): void {
    const { elements } = input;
    elements.pagePanel.hidden = input.mode !== "page" || !input.allowPage;
    elements.externalPanel.hidden = input.mode !== "external" || !input.allowExternal;
    elements.mediaPanel.hidden = input.mode !== "media" || !input.allowMedia;
    elements.searchInput.disabled = input.disabled;
    elements.externalInput.disabled = input.disabled;
    elements.fileButton.disabled = input.disabled;
    elements.picker.hidden = !input.pickerOpen || elements.pagePanel.hidden;
    if (input.mode === "external") {
        elements.externalInput.value = input.value;
    }
    renderPageLinkMedia(elements, input.mode, input.value, input.mediaLabel);
}

export function renderPageLinkMedia(
    elements: PageLinkElements,
    mode: LinkMode,
    value: string,
    mediaLabel: string,
): void {
    const hasValue = mode === "media" && value !== "";
    const isImage = hasValue && isImageMediaLink(value);
    elements.fileTitle.textContent = hasValue ? mediaDisplayName(value, isImage, mediaLabel) : "Choose file";
    elements.fileValue.textContent = hasValue ? mediaSelectionLabel(isImage) : "No file selected";
    elements.fileValue.toggleAttribute("hidden", hasValue && isImage);
    elements.fileAction.textContent = hasValue ? "Change" : "Choose";
    elements.filePreview.replaceChildren();
    elements.filePreview.dataset.kind = isImage ? "image" : "file";

    if (isImage) {
        const image = document.createElement("img");
        image.src = value;
        image.alt = "";
        image.loading = "lazy";
        elements.filePreview.append(image);
        return;
    }
    elements.filePreview.textContent = "↗";
}
