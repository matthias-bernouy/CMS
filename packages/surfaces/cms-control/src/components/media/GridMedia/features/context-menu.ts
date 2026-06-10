import type { MediaItem } from "../types";

type ContextMenuCallbacks = {
    onRename: (item: MediaItem) => void;
    onDelete: (id: string) => void;
};

export function setupContextMenu(s: ShadowRoot, callbacks: ContextMenuCallbacks) {
    const menu = s.getElementById("ctx-menu")!;
    let activeItem: MediaItem | null = null;

    menu.addEventListener("click", (e) => {
        const btn = (e.target as HTMLElement).closest("[data-action]") as HTMLElement;
        if (!btn || !activeItem) return;

        const action = btn.dataset.action;
        if (action === "rename") callbacks.onRename(activeItem);
        else if (action === "delete") callbacks.onDelete(activeItem.id);

        menu.classList.remove("visible");
    });

    document.addEventListener("click", () => menu.classList.remove("visible"));

    return {
        show(e: MouseEvent, item: MediaItem) {
            activeItem = item;
            menu.style.left = e.clientX + "px";
            menu.style.top = e.clientY + "px";
            menu.classList.add("visible");
        }
    };
}
