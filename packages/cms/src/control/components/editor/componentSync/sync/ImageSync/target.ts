import { lockActions } from "./lock";
import type { ImageSync } from "./ImageSync";

export function resolveTarget(host: ImageSync): HTMLImageElement | null {
    const component = host._component;
    if (!component) return null;
    const slot = host.slotName;
    if (!slot) return component.querySelector("img");
    return component.querySelector(`img[slot="${slot}"]`);
}

export function ensureTarget(host: ImageSync): HTMLImageElement {
    let target = resolveTarget(host);
    if (target) return target;

    target = document.createElement("img");
    const slot = host.slotName;
    if (slot) target.setAttribute("slot", slot);
    lockActions(target);
    if (host.allowResize) target.setAttribute(p9r.attr.ACTION.ALLOW_RESIZE_IMAGE, "true");
    host._component!.appendChild(target);
    return target;
}

export function syncDefault(host: ImageSync) {
    const defaultSrc = host.getAttribute("default");
    if (!defaultSrc) return;
    if (resolveTarget(host)) return;
    // Optional image: only seed the default on first creation of the parent
    // bloc (IS_CREATING="true"). Afterwards — including when the user has
    // clicked Remove — leave it empty.
    if (host.optionnal && !host.isCreating) return;

    const img = document.createElement("img");
    const slot = host.slotName;
    if (slot) img.setAttribute("slot", slot);
    img.setAttribute("src", defaultSrc);
    lockActions(img);
    if (host.allowResize) img.setAttribute(p9r.attr.ACTION.ALLOW_RESIZE_IMAGE, "true");
    host._component?.appendChild(img);
}
