import getClosestEditorSystem from "src/control/core/dom/editor/getClosestEditorSystem";
import resolveApiUrl from "src/control/core/dom/meta/resolveApiUrl";
import type { MediaCenter } from "../../../MediaCenter/MediaCenter";
import type { PageRef } from "../PageLink.picker";

export async function fetchPages(): Promise<PageRef[]> {
    try {
        const res = await fetch(resolveApiUrl("page/links"));
        return await res.json() as PageRef[];
    } catch (e) {
        console.warn("P9rLink: failed to fetch pages", e);
        return [];
    }
}

export function openMediaCenter(host: HTMLElement, onPick: (src: string) => void) {
    const mediaCenter = document.createElement("cms-media-center") as MediaCenter;
    const editorSystem = getClosestEditorSystem(host);
    editorSystem.editorDOM.append(mediaCenter);
    requestAnimationFrame(() => {
        const handler = (e: Event) => {
            mediaCenter.removeEventListener("select-item", handler);
            const src = (e as CustomEvent).detail?.src as string | undefined;
            if (!src) return;
            onPick(src);
            mediaCenter.remove();
        };
        mediaCenter.addEventListener("select-item", handler);
        mediaCenter.show(["folder", "image", "other"]);
    });
}
