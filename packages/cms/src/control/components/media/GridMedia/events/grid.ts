import type { GridMedia } from "../GridMedia";
import type { setupContextMenu } from "../features/context-menu";
import type { setupDetail } from "../features/detail/setup";

type CtxMenu = ReturnType<typeof setupContextMenu>;
type Detail = ReturnType<typeof setupDetail>;

export function wireGrid(host: GridMedia, s: ShadowRoot, ctxMenu: CtxMenu, detail: Detail) {
    const grid = s.getElementById("grid")!;

    grid.addEventListener("click", (e) => {
        const card = (e.target as HTMLElement).closest("p9r-card-media") as HTMLElement;
        if (!card) return;
        const id = card.dataset.id!;
        if (card.dataset.type === "folder") {
            const folder = host._items.find(i => i.id === id);
            host._navigateTo(id, folder?.label);
        } else {
            const item = host._items.find(i => i.id === id);
            if (item) detail.open(item);
        }
    });

    grid.addEventListener("contextmenu", (e) => {
        const card = (e.target as HTMLElement).closest("p9r-card-media") as HTMLElement;
        if (!card) return;
        const item = host._items.find(i => i.id === card.dataset.id);
        if (!item) return;
        e.preventDefault();
        ctxMenu.show(e as MouseEvent, item);
    });
}
