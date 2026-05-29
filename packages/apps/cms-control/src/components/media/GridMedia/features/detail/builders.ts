import type { MediaItem } from "../../types";
import { escapeHtml, escapeAttr, formatSize, variantUrl } from "../../types";

const ICON_COPY = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const ICON_CHECK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;

export function buildPreview(item: MediaItem): HTMLElement | null {
    const isImage = item.type === "image" || item.mimetype === "image/svg+xml";
    if (!isImage) return null;
    const isSvg = item.mimetype === "image/svg+xml";
    const img = document.createElement("img");
    img.slot = "preview";
    img.src = isSvg ? (item.absoluteURL ?? "") : variantUrl(item, 800, 600);
    img.alt = item.alt || item.label;
    return img;
}

export function buildFields(item: MediaItem): HTMLElement {
    const isImage = item.type === "image" || item.mimetype === "image/svg+xml";
    const size = item.size ? formatSize(item.size) : "";
    const dims = (item.width && item.height) ? `${item.width}×${item.height}` : "";
    const mediaUrl = item.absoluteURL ?? "";

    const el = document.createElement("div");
    el.slot = "fields";
    el.innerHTML = `
        <div class="detail-field">
            <label>Name</label>
            <input type="text" id="detail-label" value="${escapeAttr(item.label)}">
        </div>
        ${isImage ? `
        <div class="detail-field">
            <label>Alt text</label>
            <textarea id="detail-alt" rows="2">${escapeHtml(item.alt || '')}</textarea>
        </div>` : ""}
        <div class="detail-meta-row">
            <div class="detail-field">
                <label>Type</label>
                <span class="detail-value">${escapeHtml(item.mimetype || item.type)}</span>
            </div>
            <div class="detail-field">
                <label>Size</label>
                <span class="detail-value">${size || "—"}</span>
            </div>
        </div>
        ${dims ? `
        <div class="detail-field">
            <label>Dimensions</label>
            <span class="detail-value">${escapeHtml(dims)}</span>
        </div>` : ""}
        <div class="detail-field">
            <label>URL</label>
            <div class="url-row">
                <span class="detail-value mono">${escapeHtml(mediaUrl)}</span>
                <button class="btn-copy" id="btn-copy" title="Copy URL">${ICON_COPY}</button>
            </div>
        </div>
    `;

    const copyBtn = el.querySelector("#btn-copy")!;
    copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(mediaUrl);
        copyBtn.innerHTML = ICON_CHECK;
        setTimeout(() => { copyBtn.innerHTML = ICON_COPY; }, 1500);
    });

    return el;
}

export function buildActions(): HTMLElement {
    const el = document.createElement("div");
    el.slot = "actions";
    el.innerHTML = `
        <div class="detail-actions">
            <button class="btn-save" id="btn-save">Save</button>
            <button class="btn-delete" id="btn-delete">Delete</button>
        </div>
    `;
    return el;
}
