import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };
import {
    fileDetail,
    fileKind,
    fileMeta,
    fileUrl,
    matchesFileAccept,
    type BreadcrumbEntry,
    type FileItem,
    type FilesCenterFileAccept,
    type FilesCenterSelectDetail,
    type FilesPage,
} from "./filesCenterDomain";

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type { FilesCenterFileAccept, FilesCenterSelectDetail } from "./filesCenterDomain";

export type FilesCenterSelectManyDetail = {
    files: FilesCenterSelectDetail[];
};

export class FilesCenter extends HTMLElement {
    private _folder: string | null = null;
    private _trail: BreadcrumbEntry[] = [{ id: null, label: "Files" }];
    private _items: FileItem[] = [];
    private _selected: FileItem | null = null;
    private _selectedMany: FileItem[] = [];
    private _wired = false;
    private _accept: ("folder" | "file")[] = ["folder", "file"];
    private _fileAccept: FilesCenterFileAccept[] | null = null;
    private _multiple = false;
    private _maxSelection: number | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this._wire();
    }

    show(options: {
        accept?: ("folder" | "file")[];
        fileAccept?: FilesCenterFileAccept[];
        multiple?: boolean;
        maxSelection?: number;
    } = {}): void {
        this._wire();
        this._accept = options.accept ?? ["folder", "file"];
        this._fileAccept = options.fileAccept ?? null;
        this._multiple = options.multiple === true;
        this._maxSelection = typeof options.maxSelection === "number" ? Math.max(1, options.maxSelection) : null;
        this._folder = null;
        this._trail = [{ id: null, label: "Files" }];
        this._selected = null;
        this._selectedMany = [];
        this.searchInput.value = "";
        this.backdrop.hidden = false;
        void this._load();
    }

    private _wire(): void {
        if (this._wired) return;
        this._wired = true;

        this.closeButton.addEventListener("click", () => this._close());
        this.cancelButton.addEventListener("click", () => this._close());
        this.backdrop.addEventListener("click", (event) => {
            if (event.target === this.backdrop) this._close();
        });
        this.selectButton.addEventListener("click", () => this._confirm());
        this.searchInput.addEventListener("input", () => this._renderItems());
    }

    private async _load(): Promise<void> {
        this._selected = null;
        this._updateSelection();

        const params = new URLSearchParams();
        if (this._folder) params.set("parentId", this._folder);
        params.set("accept", this._accept.join(","));
        params.set("sortBy", "name");
        params.set("limit", "10000");

        const response = await fetch(`${this._basePath()}/api/files?${params.toString()}`);
        if (!response.ok) {
            this._items = [];
        } else {
            const page = await response.json() as FilesPage;
            this._items = page.items;
        }

        this._render();
    }

    private _render(): void {
        this._renderBreadcrumb();
        this._renderItems();
        this._updateSelection();
    }

    private _renderBreadcrumb(): void {
        this.breadcrumb.replaceChildren();

        this._trail.forEach((entry, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = entry.label;
            button.ariaCurrent = index === this._trail.length - 1 ? "page" : null;
            button.addEventListener("click", () => {
                this._folder = entry.id;
                this._trail = this._trail.slice(0, index + 1);
                void this._load();
            });
            this.breadcrumb.append(button);
        });
    }

    private _renderItems(): void {
        this.grid.replaceChildren();

        const query = this.searchInput.value.trim().toLowerCase();
        const items = this._items.filter((item) => {
            if (item.type === "file" && !matchesFileAccept(item, this._fileAccept)) return false;
            if (!query) return true;
            return item.name.toLowerCase().includes(query);
        });

        this.empty.hidden = items.length > 0;

        for (const item of items) {
            const button = document.createElement("button");
            button.className = "item";
            button.dataset.type = item.type === "folder" ? "folder" : fileKind(item);
            button.type = "button";
            button.ariaSelected = String(this._isSelected(item));
            button.addEventListener("click", () => {
                if (item.type === "folder") {
                    this._openFolder(item);
                    return;
                }
                this._selectFile(item);
                this._renderItems();
                this._updateSelection();
            });
            button.addEventListener("dblclick", () => {
                if (item.type === "file" && !this._multiple) this._confirm();
            });

            const preview = this._preview(item);

            const copy = document.createElement("span");
            copy.className = "copy";

            const name = document.createElement("span");
            name.className = "name";
            name.textContent = item.name;

            const meta = document.createElement("span");
            meta.className = "meta";
            meta.textContent = item.type === "folder" ? "Folder" : fileMeta(item);

            copy.append(name, meta);
            button.append(preview, copy);
            this.grid.append(button);
        }
    }

    private _openFolder(item: FileItem): void {
        this._folder = item.id;
        this._trail.push({ id: item.id, label: item.name });
        this.searchInput.value = "";
        void this._load();
    }

    private _updateSelection(): void {
        if (this._multiple) {
            const count = this._selectedMany.length;
            this.selectButton.disabled = count === 0;
            this.selectButton.textContent = count === 1 ? "Select 1 file" : `Select ${count} files`;
            this.selectionTitle.textContent = count === 0 ? "No files selected" : `${count} files selected`;
            this.selectionValue.textContent = this._maxSelection ? `Up to ${this._maxSelection} files` : "Choose files";
            return;
        }

        this.selectButton.disabled = !this._selected;
        this.selectButton.textContent = "Select file";
        this.selectionTitle.textContent = this._selected?.name ?? "No file selected";
        this.selectionValue.textContent = this._selected ? fileMeta(this._selected) : "Choose a file";
    }

    private _confirm(): void {
        if (this._multiple) {
            if (this._selectedMany.length === 0) return;
            this.dispatchEvent(new CustomEvent<FilesCenterSelectManyDetail>("select-files", {
                bubbles: true,
                composed: true,
                detail: {
                    files: this._selectedMany.map(file => fileDetail(this._basePath(), file)),
                },
            }));
            this._close();
            return;
        }

        if (!this._selected) return;
        this.dispatchEvent(new CustomEvent<FilesCenterSelectDetail>("select-file", {
            bubbles: true,
            composed: true,
            detail: fileDetail(this._basePath(), this._selected),
        }));
        this._close();
    }

    private _selectFile(item: FileItem): void {
        if (!this._multiple) {
            this._selected = item;
            return;
        }

        const existingIndex = this._selectedMany.findIndex(selected => selected.id === item.id);
        if (existingIndex >= 0) {
            this._selectedMany.splice(existingIndex, 1);
            return;
        }

        if (this._maxSelection && this._selectedMany.length >= this._maxSelection) return;
        this._selectedMany.push(item);
    }

    private _isSelected(item: FileItem): boolean {
        if (this._multiple) return this._selectedMany.some(selected => selected.id === item.id);
        return this._selected?.id === item.id;
    }

    private _close(): void {
        this.backdrop.hidden = true;
        this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
    }

    private _preview(item: FileItem): HTMLElement {
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
            image.src = fileUrl(this._basePath(), item.id);
            preview.append(image);
            return preview;
        }

        preview.innerHTML = fileKind(item) === "pdf"
            ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><text x="7" y="17">PDF</text></svg>`
            : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/></svg>`;
        return preview;
    }

    private _basePath(): string {
        return document.querySelector<HTMLMetaElement>('meta[name="basePath"]')?.content ?? "";
    }

    private get backdrop(): HTMLElement {
        return this.shadowRoot!.querySelector(".backdrop")!;
    }

    private get closeButton(): HTMLButtonElement {
        return this.shadowRoot!.querySelector(".close")!;
    }

    private get cancelButton(): HTMLButtonElement {
        return this.shadowRoot!.querySelector(".cancel")!;
    }

    private get selectButton(): HTMLButtonElement {
        return this.shadowRoot!.querySelector(".select")!;
    }

    private get searchInput(): HTMLInputElement {
        return this.shadowRoot!.querySelector(".search")!;
    }

    private get breadcrumb(): HTMLElement {
        return this.shadowRoot!.querySelector(".breadcrumb")!;
    }

    private get grid(): HTMLElement {
        return this.shadowRoot!.querySelector(".grid")!;
    }

    private get empty(): HTMLElement {
        return this.shadowRoot!.querySelector(".empty")!;
    }

    private get selectionTitle(): HTMLElement {
        return this.shadowRoot!.querySelector(".selection strong")!;
    }

    private get selectionValue(): HTMLElement {
        return this.shadowRoot!.querySelector(".selection code")!;
    }
}

if (!customElements.get("cms-editor-v2-files-center")) {
    customElements.define("cms-editor-v2-files-center", FilesCenter);
}
