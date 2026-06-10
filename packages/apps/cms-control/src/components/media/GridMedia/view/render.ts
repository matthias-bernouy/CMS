import type { MediaItem, BreadcrumbEntry } from "../types";
import { escapeHtml, escapeAttr } from "cms-control/core/dom/escapeHtml";
import { variantUrl } from "../types";
import { localPreview } from "../api/write";

export function renderGrid(grid: HTMLElement, items: MediaItem[]) {
    grid.innerHTML = "";

    for (const item of items) {
        const card = document.createElement("p9r-card-media");
        card.setAttribute("data-id", item.id);
        card.setAttribute("data-type", item.type);

        if (item.type === "folder") {
            card.setAttribute("type", "folder");
        } else {
            appendMediaPreview(card, item);
        }

        const label = document.createElement("span");
        label.slot = "label";
        label.textContent = item.label;
        card.appendChild(label);

        grid.appendChild(card);
    }
}

function appendMediaPreview(card: HTMLElement, item: MediaItem) {
    const isImage = item.type === "image";
    const isSvg = item.mimetype === "image/svg+xml";

    if (isImage || isSvg) {
        const img = document.createElement("img");
        img.slot = "image";
        // `variantUrl` is the display URL (absoluteURL + `?v=contentHash`), SVG
        // included — its width/height args are ignored for now. A just-replaced
        // file paints from the in-memory `localPreview` first.
        img.src = localPreview(item.id) ?? variantUrl(item, 400, 300);
        img.alt = item.alt || item.label;
        img.loading = "lazy";
        card.appendChild(img);
    } else {
        const ext = item.label.split('.').pop()?.toUpperCase() || "FILE";
        const icon = document.createElement("span");
        icon.slot = "image";
        icon.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
            </svg>
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">${ext}</span>
        `;
        icon.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:100%;height:100%;color:var(--text-muted,#94a3b8);";
        card.appendChild(icon);
    }
}

export function renderBreadcrumb(container: HTMLElement, folder: string | null, breadcrumb: BreadcrumbEntry[]) {
    if (!folder) {
        container.innerHTML = `<span class="bc-current">Root</span>`;
        return;
    }

    let html = `<span class="bc-item" data-folder="" data-index="-1">Root</span>`;

    for (let i = 0; i < breadcrumb.length; i++) {
        const crumb = breadcrumb[i]!;
        const isLast = i === breadcrumb.length - 1;
        html += `<span class="bc-sep">/</span>`;

        if (isLast) {
            html += `<span class="bc-current">${escapeHtml(crumb.label)}</span>`;
        } else {
            html += `<span class="bc-item" data-folder="${escapeAttr(crumb.id)}" data-index="${i}">${escapeHtml(crumb.label)}</span>`;
        }
    }

    container.innerHTML = html;
}
