type DragDropCallbacks = {
    onFiles: (files: FileList) => void;
};

export function setupDragDrop(s: ShadowRoot, callbacks: DragDropCallbacks) {
    const fileInput = s.getElementById("file-input") as HTMLInputElement;
    const dropOverlay = s.getElementById("drop-overlay")!;
    let dragCounter = 0;
    let internalDrag = false;

    fileInput.addEventListener("change", () => {
        if (fileInput.files?.length) callbacks.onFiles(fileInput.files);
    });

    s.getElementById("grid")!.addEventListener("dragstart", () => { internalDrag = true; });
    document.addEventListener("dragend", () => { internalDrag = false; });

    document.addEventListener("dragenter", (e) => {
        e.preventDefault();
        if (internalDrag) return;
        dragCounter++;
        if (dragCounter === 1) dropOverlay.classList.add("visible");
    });

    document.addEventListener("dragleave", (e) => {
        e.preventDefault();
        if (internalDrag) return;
        dragCounter--;
        if (dragCounter === 0) dropOverlay.classList.remove("visible");
    });

    document.addEventListener("dragover", (e) => e.preventDefault());

    document.addEventListener("drop", (e) => {
        e.preventDefault();
        dragCounter = 0;
        dropOverlay.classList.remove("visible");
        if (internalDrag) { internalDrag = false; return; }
        if (e.dataTransfer?.files.length) callbacks.onFiles(e.dataTransfer.files);
    });

    return {
        trigger() {
            fileInput.click();
        }
    };
}
