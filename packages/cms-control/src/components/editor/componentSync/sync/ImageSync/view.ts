import { ICON_UPLOAD } from "src/control/components/icons";
import { lockActions } from "./lock";
import { resolveTarget } from "./target";
import type { ImageSync } from "./ImageSync";

export function render(host: ImageSync) {
    host._target = resolveTarget(host);
    lockActions(host._target);
    watchTarget(host);
    const label = host.getAttribute("label") || "Image";
    const currentValue = host._target?.getAttribute("src") || "";

    const shadow = host.shadowRoot!;
    // Drop any previously stamped DOM, but keep the <style> seeded by the
    // constructor so the styles survive re-renders.
    Array.from(shadow.children).forEach(c => { if (c.tagName !== "STYLE") c.remove(); });

    const labelEl = document.createElement("span");
    labelEl.className = "image-sync-label";
    labelEl.textContent = label;

    const card = document.createElement("div");
    card.className = "image-sync-card";

    host._previewImg = document.createElement("img");

    host._emptyState = document.createElement("div");
    host._emptyState.className = "image-sync-empty";
    host._emptyState.innerHTML = `${ICON_UPLOAD}<span>Click to choose an image</span>`;

    host._overlay = document.createElement("div");
    host._overlay.className = "image-sync-overlay";

    const btnChange = document.createElement("button");
    btnChange.className = "btn-change";
    btnChange.textContent = "Change";
    btnChange.addEventListener("click", (e) => { e.stopPropagation(); host.openMediaCenter(); });

    const btnRemove = document.createElement("button");
    btnRemove.className = "btn-remove";
    btnRemove.textContent = "Remove";
    btnRemove.addEventListener("click", (e) => { e.stopPropagation(); host.clearTarget(); });

    host._overlay.appendChild(btnChange);
    host._overlay.appendChild(btnRemove);

    card.appendChild(host._previewImg);
    card.appendChild(host._emptyState);
    card.appendChild(host._overlay);

    card.addEventListener("click", () => host.openMediaCenter());

    shadow.appendChild(labelEl);
    shadow.appendChild(card);

    updatePreview(host, currentValue);
}

export function updatePreview(host: ImageSync, src: string) {
    if (!host._previewImg || !host._emptyState || !host._overlay) return;
    const card = host._previewImg.parentElement!;

    if (src) {
        host._previewImg.src = src;
        host._previewImg.style.display = "block";
        host._emptyState.style.display = "none";
        host._overlay.style.display = "flex";
        card.classList.add("has-image");
    } else {
        host._previewImg.style.display = "none";
        host._emptyState.style.display = "flex";
        host._overlay.style.display = "none";
        card.classList.remove("has-image");
    }
}

/**
 * The target `<img>` can have its `src` mutated from outside the panel
 * (e.g. ImageEditor's own click-to-MediaCenter flow). Watch for that so
 * the preview mirrors the live value.
 */
export function watchTarget(host: ImageSync) {
    host._targetObserver?.disconnect();
    host._targetObserver = null;
    const target = host._target;
    if (!target) return;
    host._targetObserver = new MutationObserver(() => {
        updatePreview(host, target.getAttribute("src") || "");
    });
    host._targetObserver.observe(target, { attributes: true, attributeFilter: ["src"] });
}
