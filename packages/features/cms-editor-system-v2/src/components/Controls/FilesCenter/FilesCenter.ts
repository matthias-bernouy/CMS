import type { MediaAccept } from "@bernouy/cms-content/editor";
import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

type FileItem = {
    id: string;
    name: string;
    parentId: string | null;
    type: "folder" | "file";
    size?: number;
    mimeType?: string;
    contentHash?: string;
};

type FilesPage = {
    items: FileItem[];
};

type BreadcrumbEntry = {
    id: string | null;
    label: string;
};

export type FilesCenterFileAccept = MediaAccept;

export type FilesCenterSelectDetail = {
    id: string;
    label: string;
    src: string;
    mimeType?: string;
};

export class FilesCenter extends HTMLElement {
    private _folder: string | null = null;
    private _trail: BreadcrumbEntry[] = [{ id: null, label: "Files" }];
    private _items: FileItem[] = [];
    private _selected: FileItem | null = null;
    private _wired = false;
    private _accept: ("folder" | "file")[] = ["folder", "file"];
    private _fileAccept: FilesCenterFileAccept[] | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).append(template.content.cloneNode(true));
    }

    connectedCallback(): void {
        this._wire();
    }

    show(options: { accept?: ("folder" | "file")[]; fileAccept?: FilesCenterFileAccept[] } = {}): void {
        this._wire();
        this._accept = options.accept ?? ["folder", "file"];
        this._fileAccept = options.fileAccept ?? null;
        this._folder = null;
        this._trail = [{ id: null, label: "Files" }];
        this._selected = null;
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
            if (item.type === "file" && !this._matchesFileAccept(item)) return false;
            if (!query) return true;
            return item.name.toLowerCase().includes(query);
        });

        this.empty.hidden = items.length > 0;

        for (const item of items) {
            const button = document.createElement("button");
            button.className = "item";
            button.dataset.type = item.type === "folder" ? "folder" : this._fileKind(item);
            button.type = "button";
            button.ariaSelected = String(this._selected?.id === item.id);
            button.addEventListener("click", () => {
                if (item.type === "folder") {
                    this._openFolder(item);
                    return;
                }
                this._selected = item;
                this._renderItems();
                this._updateSelection();
            });
            button.addEventListener("dblclick", () => {
                if (item.type === "file") this._confirm();
            });

            const preview = this._preview(item);

            const copy = document.createElement("span");
            copy.className = "copy";

            const name = document.createElement("span");
            name.className = "name";
            name.textContent = item.name;

            const meta = document.createElement("span");
            meta.className = "meta";
            meta.textContent = item.type === "folder" ? "Folder" : this._fileMeta(item);

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
        this.selectButton.disabled = !this._selected;
        this.selectionTitle.textContent = this._selected?.name ?? "No file selected";
        this.selectionValue.textContent = this._selected ? this._fileMeta(this._selected) : "Choose a file";
    }

    private _confirm(): void {
        if (!this._selected) return;
        this.dispatchEvent(new CustomEvent<FilesCenterSelectDetail>("select-file", {
            bubbles: true,
            composed: true,
            detail: {
                id: this._selected.id,
                label: this._selected.name,
                src: this._fileUrl(this._selected.id),
                mimeType: this._selected.mimeType,
            },
        }));
        this._close();
    }

    private _close(): void {
        this.backdrop.hidden = true;
        this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
    }

    private _fileUrl(id: string): string {
        return `${this._basePath()}/.cms/files/by-id/${encodeURIComponent(id)}`;
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
            image.src = this._fileUrl(item.id);
            preview.append(image);
            return preview;
        }

        preview.innerHTML = this._fileKind(item) === "pdf"
            ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/><text x="7" y="17">PDF</text></svg>`
            : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5"/></svg>`;
        return preview;
    }

    private _fileKind(item: FileItem): "image" | "pdf" | "file" {
        if (item.mimeType?.startsWith("image/")) return "image";
        if (item.mimeType?.includes("pdf")) return "pdf";
        return "file";
    }

    private _matchesFileAccept(item: FileItem): boolean {
        if (!this._fileAccept || this._fileAccept.length === 0) return true;

        const mimeType = item.mimeType ?? "";
        if (this._fileAccept.includes("image") && mimeType.startsWith("image/")) return true;
        if (this._fileAccept.includes("svg") && mimeType === "image/svg+xml") return true;
        if (this._fileAccept.includes("bitmap") && mimeType.startsWith("image/") && mimeType !== "image/svg+xml") return true;
        if (this._fileAccept.includes("video") && mimeType.startsWith("video/")) return true;
        if (this._fileAccept.includes("audio") && mimeType.startsWith("audio/")) return true;
        if (this._fileAccept.includes("document") && !mimeType.startsWith("image/") && !mimeType.startsWith("video/") && !mimeType.startsWith("audio/")) return true;
        return false;
    }

    private _fileMeta(item: FileItem): string {
        const parts = [item.mimeType ?? "File"];
        if (typeof item.size === "number") parts.push(this._formatSize(item.size));
        return parts.join(" · ");
    }

    private _formatSize(size: number): string {
        if (size < 1024) return `${size} B`;
        if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
        return `${(size / 1024 / 1024).toFixed(1)} MB`;
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
