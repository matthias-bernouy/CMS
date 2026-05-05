import type { GridMedia } from "../GridMedia";
import * as api from "../api";
import { setupContextMenu } from "./context-menu";
import { setupRename } from "./rename";
import { setupNewFolder } from "./new-folder";
import { setupDragDrop } from "./drag-drop";
import { setupDetail } from "./detail/setup";

/**
 * Wires every per-feature controller (context menu, rename dialog, new
 * folder prompt, drag-drop overlay, detail panel) and connects each one
 * to the shared host (mutations call `_cms.Media`, then trigger a
 * refresh on the host). Returns the few controllers the host still
 * needs to drive directly (ctxMenu, dragDrop, detail).
 */
export function setupFeatures(host: GridMedia, s: ShadowRoot) {
    const refresh = () => host._refresh();

    const ctxMenu = setupContextMenu(s, {
        onRename: (item) => rename.open(item),
        onDelete: (id)   => host._confirmDelete(id),
    });

    const rename = setupRename(s, {
        onApply: async (id, name) => {
            await api.renameItem(id, name);
            refresh();
        },
    });

    setupNewFolder(host, s, {
        onCreate: async (name) => {
            await api.createFolder(name, host._folder);
            refresh();
        },
    });

    const dragDrop = setupDragDrop(s, {
        onFiles: async (files) => {
            await api.uploadFiles(files, host._folder);
            refresh();
        },
    });

    const detail = setupDetail(host.detail, {
        onSave: async (id, data) => {
            if (await api.saveItemMetadata(id, data)) host.detail.close();
        },
        onDelete: async (id) => {
            if (!confirm("Delete this file?")) return;
            if (await api.deleteItem(id)) {
                host.detail.close();
                refresh();
            }
        },
        onClose: refresh,
    });

    return { ctxMenu, dragDrop, detail };
}
