import {
    fileKind,
    fileMeta,
    fileUrl,
    matchesFileAccept,
    type BreadcrumbEntry,
    type FileItem,
    type FilesCenterFileAccept,
} from "./filesCenterDomain";

export function renderFilesBreadcrumb(
    container: HTMLElement,
    trail: BreadcrumbEntry[],
    onOpen: (entry: BreadcrumbEntry, index: number) => void,
): void {
    container.replaceChildren();
    trail.forEach((entry, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = entry.label;
        button.ariaCurrent = index === trail.length - 1 ? "page" : null;
        button.addEventListener("click", () => onOpen(entry, index));
        container.append(button);
    });
}

export function renderFilesList(input: {
    basePath: string;
    empty: HTMLElement;
    fileAccept: FilesCenterFileAccept[] | null;
    grid: HTMLElement;
    isSelected: (item: FileItem) => boolean;
    items: FileItem[];
    multiple: boolean;
    onConfirm: () => void;
    onOpenFolder: (item: FileItem) => void;
    onSelectFile: (item: FileItem) => void;
    query: string;
}): void {
    input.grid.replaceChildren();
    const query = input.query.trim().toLowerCase();
    const items = input.items.filter((item) => {
        if (item.type === "file" && !matchesFileAccept(item, input.fileAccept)) {
            return false;
        }
        return !query || item.name.toLowerCase().includes(query);
    });
    input.empty.hidden = items.length > 0;

    for (const item of items) {
        const button = document.createElement("button");
        button.className = "item";
        button.dataset.type = item.type === "folder" ? "folder" : fileKind(item);
        button.type = "button";
        button.ariaSelected = String(input.isSelected(item));
        button.addEventListener("click", () => {
            if (item.type === "folder") {
                input.onOpenFolder(item);
                return;
            }
            input.onSelectFile(item);
        });
        button.addEventListener("dblclick", () => {
            if (item.type === "file" && !input.multiple) {
                input.onConfirm();
            }
        });
        button.append(renderFilePreview(item, input.basePath), renderFileCopy(item));
        input.grid.append(button);
    }
}

function renderFileCopy(item: FileItem): HTMLElement {
    const copy = document.createElement("span");
    copy.className = "copy";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = item.name;
    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = item.type === "folder" ? "Folder" : fileMeta(item);
    copy.append(name, meta);
    return copy;
}

function renderFilePreview(item: FileItem, basePath: string): HTMLElement {
    const preview = document.createElement("span");
    preview.className = "preview";
    if (item.type === "folder") {
        preview.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.8A2.8 2.8 0 0 1 5.8 4h4.1l2 2H18.2A2.8 2.8 0 0 1 21 8.8v8.4a2.8 2.8 0 0 1-2.8 2.8H5.8A2.8 2.8 0 0 1 3 17.2Z"/></svg>`;
        return preview;
    }
    if (item.mimeType?.startsWith("image/")) {
        const image = document.createElement("img");
        image.alt = "";
        image.loading = "lazy";
        image.src = fileUrl(basePath, item.id);
        preview.append(image);
        return preview;
    }
    preview.innerHTML =
        fileKind(item) === "pdf"
            ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><text x="7" y="17">PDF</text></svg>`
            : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/></svg>`;
    return preview;
}
