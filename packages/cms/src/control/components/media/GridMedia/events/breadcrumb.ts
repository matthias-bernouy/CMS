import type { GridMedia } from "../GridMedia";

export function wireBreadcrumb(host: GridMedia, s: ShadowRoot) {
    s.getElementById("breadcrumb")!.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (!target.classList.contains("bc-item")) return;
        const folder = target.dataset.folder || null;
        const index = parseInt(target.dataset.index || "-1");
        host._breadcrumb = host._breadcrumb.slice(0, index + 1);
        host._navigateTo(folder);
    });
}
