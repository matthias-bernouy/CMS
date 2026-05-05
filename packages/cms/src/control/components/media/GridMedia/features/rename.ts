import type { MediaItem } from "../types";

type RenameCallbacks = {
    onApply: (id: string, newName: string) => void;
};

export function setupRename(s: ShadowRoot, callbacks: RenameCallbacks) {
    const backdrop = s.getElementById("rename-backdrop")!;
    const input = s.getElementById("rename-input") as HTMLInputElement;
    const confirmBtn = s.getElementById("rename-confirm")!;
    const cancelBtn = s.getElementById("rename-cancel")!;

    let currentItem: MediaItem | null = null;

    const hide = () => {
        backdrop.classList.remove("visible");
        currentItem = null;
    };

    const apply = () => {
        const name = input.value.trim();
        if (!name || !currentItem) return;
        const id = currentItem.id;
        hide();
        callbacks.onApply(id, name);
    };

    confirmBtn.addEventListener("click", apply);
    cancelBtn.addEventListener("click", hide);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) hide(); });
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") apply();
        if (e.key === "Escape") hide();
    });

    return {
        open(item: MediaItem) {
            currentItem = item;
            input.value = item.label;
            backdrop.classList.add("visible");
            requestAnimationFrame(() => { input.focus(); input.select(); });
        }
    };
}
