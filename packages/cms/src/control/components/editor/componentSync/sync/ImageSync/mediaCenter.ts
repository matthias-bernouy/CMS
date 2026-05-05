import type { MediaCenter } from "../../../MediaCenter/MediaCenter";
import { ensureTarget } from "./target";
import { lockActions } from "./lock";
import { watchTarget, updatePreview } from "./view";
import type { ImageSync } from "./ImageSync";

export function openMediaCenter(host: ImageSync) {
    const acceptRaw = host.getAttribute("accept") || "image";
    const types = ["folder", ...acceptRaw.split(",").map(t => t.trim())];

    const mediaCenter = document.createElement("cms-media-center") as MediaCenter;
    document.body.appendChild(mediaCenter);

    requestAnimationFrame(() => {
        const handler = (e: Event) => {
            mediaCenter.removeEventListener("select-item", handler);
            const src = (e as CustomEvent).detail?.src as string | undefined;
            if (src) {
                host._target = ensureTarget(host);
                lockActions(host._target);
                watchTarget(host);
                host._target.setAttribute("src", src);
                updatePreview(host, src);
            }
            mediaCenter.remove();
        };
        mediaCenter.addEventListener("select-item", handler);
        mediaCenter.show(types);
    });
}

export function clearTarget(host: ImageSync) {
    if (host._target) {
        host._target.remove();
        host._target = null;
    }
    watchTarget(host);
    updatePreview(host, "");
}
