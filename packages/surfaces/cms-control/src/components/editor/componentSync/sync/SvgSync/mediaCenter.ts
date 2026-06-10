import type { MediaCenter } from "../../../MediaCenter/MediaCenter";
import { resolveTarget } from "./target";
import { lockActions } from "./lock";
import { sanitizeSvg } from "./sanitize";
import { updatePreview } from "./view";
import type { SvgSync } from "./SvgSync";

/**
 * Open MediaCenter filtered to SVG files, then fetch + sanitize + swap
 * the slotted SVG in place. The new SVG inherits the previous one's
 * `slot` and `class` attributes so the bloc's CSS keeps matching and
 * the slot projection stays intact.
 */
export function openPicker(host: SvgSync) {
    host._clearError();
    const mc = document.createElement("cms-media-center") as MediaCenter;
    document.body.appendChild(mc);

    const handler = async (e: Event) => {
        mc.removeEventListener("select-item", handler);
        const src = (e as CustomEvent).detail?.src as string | undefined;
        const mimetype = (e as CustomEvent).detail?.mimetype as string | undefined;
        mc.remove();
        if (!src) return;
        // Gate on the real mime type, not the URL — id URLs carry no `.svg`.
        if (mimetype !== "image/svg+xml") {
            host._showError("Please pick an SVG file.");
            return;
        }
        try {
            const raw = await fetch(src).then(r => r.text());
            const cleaned = sanitizeSvg(raw);
            swapInto(host, cleaned);
        } catch (err) {
            host._showError(err instanceof Error ? err.message : String(err));
        }
    };
    mc.addEventListener("select-item", handler);
    requestAnimationFrame(() => mc.show(["folder", "image"]));
}

function swapInto(host: SvgSync, svgMarkup: string) {
    const target = resolveTarget(host);
    if (!target) {
        host._showError("Target SVG not found in bloc.");
        return;
    }
    const parsed = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
    const fresh = parsed.documentElement;
    if (!(fresh instanceof SVGElement)) {
        host._showError("Sanitized markup is not a valid SVG.");
        return;
    }
    // Carry over the attributes that hook the new SVG into the bloc's
    // shadow projection (slot) and its CSS selectors (class). Everything
    // else (viewBox, paths, …) comes from the freshly picked file.
    const slot = target.getAttribute("slot");
    if (slot) fresh.setAttribute("slot", slot);
    const cls = target.getAttribute("class");
    if (cls) fresh.setAttribute("class", cls);
    lockActions(fresh);

    target.replaceWith(fresh);
    updatePreview(host);
}
