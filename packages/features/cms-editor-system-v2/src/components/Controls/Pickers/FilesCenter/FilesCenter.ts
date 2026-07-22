import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./styles/index";
import {
    type BreadcrumbEntry,
    type FileItem,
    type FilesCenterFileAccept,
    type FilesCenterSelectDetail,
    type FilesCenterShowOptions,
    loadFilesPage,
} from "./filesCenterDomain";
import { type FilesCenterElements, queryFilesCenterElements, wireFilesCenterElements } from "./filesCenterElements";
import { renderFilesBreadcrumb, renderFilesList } from "./filesCenterList";
import {
    dispatchFilesSelection,
    isFileSelected,
    renderFilesSelection,
    type FilesCenterSelectManyDetail,
    type FilesCenterSelection,
    toggleSelectedFile,
} from "./filesCenterSelection";

const template = document.createElement("template");
template.innerHTML = `<style>${String(componentCss)}</style>${String(templateHtml)}`;

export type { FilesCenterFileAccept, FilesCenterSelectDetail } from "./filesCenterDomain";

export type { FilesCenterSelectManyDetail } from "./filesCenterSelection";

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
    private readonly elements: FilesCenterElements;

    constructor() {
        super();
        const shadowRoot = this.attachShadow({ mode: "open" });
        shadowRoot.append(template.content.cloneNode(true));
        this.elements = queryFilesCenterElements(shadowRoot);
    }

    connectedCallback(): void {
        this._wire();
    }

    show(options: FilesCenterShowOptions = {}): void {
        this._wire();
        this._accept = options.accept ?? ["folder", "file"];
        this._fileAccept = options.fileAccept ?? null;
        this._multiple = options.multiple === true;
        this._maxSelection = typeof options.maxSelection === "number" ? Math.max(1, options.maxSelection) : null;
        this._folder = null;
        this._trail = [{ id: null, label: "Files" }];
        this._selected = null;
        this._selectedMany = [];
        this.elements.searchInput.value = "";
        this.elements.backdrop.hidden = false;
        void this._load();
    }

    private _wire(): void {
        if (this._wired) {
            return;
        }
        this._wired = true;

        wireFilesCenterElements(this.elements, {
            close: () => this._close(),
            confirm: () => this._confirm(),
            search: () => this._renderItems(),
        });
    }

    private async _load(): Promise<void> {
        this._selected = null;
        this._updateSelection();

        this._items = await loadFilesPage(this._basePath(), this._folder, this._accept);
        this._render();
    }

    private _render(): void {
        this._renderBreadcrumb();
        this._renderItems();
        this._updateSelection();
    }

    private _renderBreadcrumb(): void {
        renderFilesBreadcrumb(this.elements.breadcrumb, this._trail, (entry, index) => {
            this._folder = entry.id;
            this._trail = this._trail.slice(0, index + 1);
            void this._load();
        });
    }

    private _renderItems(): void {
        renderFilesList({
            basePath: this._basePath(),
            empty: this.elements.empty,
            fileAccept: this._fileAccept,
            grid: this.elements.grid,
            isSelected: (item) => this._isSelected(item),
            items: this._items,
            multiple: this._multiple,
            onConfirm: () => this._confirm(),
            onOpenFolder: (item) => this._openFolder(item),
            onSelectFile: (item) => {
                this._selectFile(item);
                this._renderItems();
                this._updateSelection();
            },
            query: this.elements.searchInput.value,
        });
    }

    private _openFolder(item: FileItem): void {
        this._folder = item.id;
        this._trail.push({ id: item.id, label: item.name });
        this.elements.searchInput.value = "";
        void this._load();
    }

    private _updateSelection(): void {
        renderFilesSelection(this.elements, this._selection());
    }

    private _confirm(): void {
        if (dispatchFilesSelection(this, this._basePath(), this._selection())) {
            this._close();
        }
    }

    private _selectFile(item: FileItem): void {
        this._selected = toggleSelectedFile(item, this._selection());
    }

    private _isSelected(item: FileItem): boolean {
        return isFileSelected(item, this._selection());
    }

    private _close(): void {
        this.elements.backdrop.hidden = true;
        this.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
    }

    private _basePath(): string {
        return document.querySelector<HTMLMetaElement>('meta[name="basePath"]')?.content ?? "";
    }

    private _selection(): FilesCenterSelection {
        return {
            maxSelection: this._maxSelection,
            multiple: this._multiple,
            selected: this._selected,
            selectedMany: this._selectedMany,
        };
    }
}

if (!customElements.get("cms-editor-v2-files-center")) {
    customElements.define("cms-editor-v2-files-center", FilesCenter);
}
