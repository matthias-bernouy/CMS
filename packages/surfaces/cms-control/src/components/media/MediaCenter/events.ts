import { uploadFiles } from "cms-control/components/media/GridMedia/api";
import type { MediaItem } from "cms-control/components/media/GridMedia/types";

export type MediaCenterEventBindings = {
    root: ShadowRoot;
    dialog: HTMLDialogElement;
    grid: HTMLElement;
    getFolder(): string | null;
    findItem(id: string): MediaItem | undefined;
    navigate(folderId: string | null, label?: string): void;
    navigateBreadcrumb(folderId: string | null, index: number): void;
    select(card: HTMLElement, id: string): void;
    confirmSelection(): void;
    openNewFolder(): void;
    createFolder(input: HTMLInputElement, backdrop: HTMLElement): Promise<void>;
    refresh(): void;
};

export function wireMediaCenterEvents(bindings: MediaCenterEventBindings): void {
    wireDialog(bindings);
    wireFolderCreation(bindings);
    wireUploads(bindings);
    wireGrid(bindings);
    wireBreadcrumb(bindings);
    wireFileDrop(bindings);
}

function wireDialog({ root, dialog }: MediaCenterEventBindings): void {
    root.getElementById("btnClose")!.addEventListener("click", () => dialog.close());
    root.getElementById("btnCancel")!.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
        if (event.target === dialog) {
            dialog.close();
        }
    });
}

function wireFolderCreation(bindings: MediaCenterEventBindings): void {
    const { root } = bindings;
    root.getElementById("btnCreateFolder")!.addEventListener("click", bindings.openNewFolder);

    const backdrop = root.getElementById("nf-backdrop")!;
    const input = root.getElementById("nf-input") as HTMLInputElement;
    root.getElementById("nf-cancel")!.addEventListener("click", () => backdrop.classList.remove("open"));
    root.getElementById("nf-confirm")!.addEventListener("click", () => bindings.createFolder(input, backdrop));
    input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            void bindings.createFolder(input, backdrop);
        }
        if (event.key === "Escape") {
            backdrop.classList.remove("open");
        }
    });
}

function wireUploads(bindings: MediaCenterEventBindings): void {
    const input = bindings.root.getElementById("file-input") as HTMLInputElement;
    bindings.root.getElementById("btnUpload")!.addEventListener("click", () => input.click());
    input.addEventListener("change", async () => {
        if (!input.files?.length) {
            return;
        }
        await uploadFiles(input.files, bindings.getFolder());
        input.value = "";
        bindings.refresh();
    });
}

function wireGrid(bindings: MediaCenterEventBindings): void {
    bindings.grid.addEventListener("click", (event) => {
        const card = (event.target as HTMLElement).closest("p9r-card-media") as HTMLElement;
        if (!card) {
            return;
        }
        const id = card.dataset.id!;
        if (card.dataset.type === "folder") {
            bindings.navigate(id, bindings.findItem(id)?.label);
        } else {
            bindings.select(card, id);
        }
    });
    bindings.grid.addEventListener("dblclick", (event) => {
        const card = (event.target as HTMLElement).closest("p9r-card-media") as HTMLElement;
        if (card && card.dataset.type !== "folder") {
            bindings.confirmSelection();
        }
    });
}

function wireBreadcrumb(bindings: MediaCenterEventBindings): void {
    bindings.root.getElementById("breadcrumb")!.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (!target.classList.contains("bc-item")) {
            return;
        }
        bindings.navigateBreadcrumb(target.dataset.folder || null, parseInt(target.dataset.index || "-1"));
    });
}

function wireFileDrop(bindings: MediaCenterEventBindings): void {
    const container = bindings.root.querySelector(".modal-container") as HTMLElement;
    const overlay = bindings.root.getElementById("drop-overlay")!;
    let dragCounter = 0;

    container.addEventListener("dragenter", (event) => {
        if (event.dataTransfer?.types.includes("Files")) {
            event.preventDefault();
            dragCounter++;
            overlay.classList.add("active");
        }
    });
    container.addEventListener("dragleave", () => {
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            overlay.classList.remove("active");
        }
    });
    container.addEventListener("dragover", (event) => event.preventDefault());
    container.addEventListener("drop", async (event) => {
        event.preventDefault();
        dragCounter = 0;
        overlay.classList.remove("active");
        if (event.dataTransfer?.files.length) {
            await uploadFiles(event.dataTransfer.files, bindings.getFolder());
            bindings.refresh();
        }
    });
}
