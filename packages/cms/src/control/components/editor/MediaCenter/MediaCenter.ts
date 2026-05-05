import html from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from 'src/control/core/editorSystem/Component';

import "src/control/components/media/CardMedia/CardMedia";
import type { MediaItem, BreadcrumbEntry } from "src/control/components/media/GridMedia/types";
import { uploadFiles, createFolder, fetchItems, type LocalTypeFilter } from "src/control/components/media/GridMedia/api";
import { renderBreadcrumb, renderGrid } from '../../media/GridMedia/view/render';

export class MediaCenter extends Component {
    private _dialog: HTMLDialogElement | null = null;
    private _grid: HTMLElement | null = null;
    private _btnSelect: HTMLButtonElement | null = null;

    private _folder: string | null = null;
    private _breadcrumb: BreadcrumbEntry[] = [];
    private _items: MediaItem[] = [];
    private _selectedItem: MediaItem | null = null;
    private _types: string[] = [];
    private _dragCounter = 0;

    constructor() {
        super({
            css: css as unknown as string,
            template: html as unknown as string
        });
    }

    override connectedCallback() {
        const s = this.shadowRoot!;
        this._dialog = s.querySelector("dialog");
        this._grid = s.getElementById("grid");
        this._btnSelect = s.getElementById("btnSelect") as HTMLButtonElement;

        // Close
        s.getElementById("btnClose")!.addEventListener("click", () => this._dialog?.close());
        s.getElementById("btnCancel")!.addEventListener("click", () => this._dialog?.close());
        this._dialog!.addEventListener("click", (e) => {
            if (e.target === this._dialog) this._dialog?.close();
        });

        // New folder
        s.getElementById("btnCreateFolder")!.addEventListener("click", () => this._openNewFolder());

        const nfBackdrop = s.getElementById("nf-backdrop")!;
        const nfInput = s.getElementById("nf-input") as HTMLInputElement;
        s.getElementById("nf-cancel")!.addEventListener("click", () => nfBackdrop.classList.remove("open"));
        s.getElementById("nf-confirm")!.addEventListener("click", () => this._createFolder(nfInput, nfBackdrop));
        nfInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") this._createFolder(nfInput, nfBackdrop);
            if (e.key === "Escape") nfBackdrop.classList.remove("open");
        });

        // Upload
        const fileInput = s.getElementById("file-input") as HTMLInputElement;
        s.getElementById("btnUpload")!.addEventListener("click", () => fileInput.click());
        fileInput.addEventListener("change", async () => {
            if (!fileInput.files?.length) return;
            await uploadFiles(fileInput.files, this._folder);
            fileInput.value = "";
            this._refresh();
        });

        // Select
        this._btnSelect!.addEventListener("click", () => this._confirmSelection());

        // Grid clicks
        this._grid!.addEventListener("click", (e) => {
            const card = (e.target as HTMLElement).closest("p9r-card-media") as HTMLElement;
            if (!card) return;

            const id = card.dataset.id!;
            const type = card.dataset.type;

            if (type === "folder") {
                const folder = this._items.find(i => i.id === id);
                this._navigateTo(id, folder?.label);
            } else {
                this._select(card, id);
            }
        });

        // Double-click to confirm
        this._grid!.addEventListener("dblclick", (e) => {
            const card = (e.target as HTMLElement).closest("p9r-card-media") as HTMLElement;
            if (!card || card.dataset.type === "folder") return;
            this._confirmSelection();
        });

        // Breadcrumb clicks
        s.getElementById("breadcrumb")!.addEventListener("click", (e) => {
            const target = e.target as HTMLElement;
            if (!target.classList.contains("bc-item")) return;
            const folder = target.dataset.folder || null;
            const index = parseInt(target.dataset.index || "-1");
            this._breadcrumb = this._breadcrumb.slice(0, index + 1);
            this._navigateTo(folder);
        });

        // Drag & drop
        const container = s.querySelector(".modal-container") as HTMLElement;
        const overlay = s.getElementById("drop-overlay")!;

        container.addEventListener("dragenter", (e) => {
            if (e.dataTransfer?.types.includes("Files")) {
                e.preventDefault();
                this._dragCounter++;
                overlay.classList.add("active");
            }
        });
        container.addEventListener("dragleave", () => {
            this._dragCounter--;
            if (this._dragCounter <= 0) {
                this._dragCounter = 0;
                overlay.classList.remove("active");
            }
        });
        container.addEventListener("dragover", (e) => e.preventDefault());
        container.addEventListener("drop", async (e) => {
            e.preventDefault();
            this._dragCounter = 0;
            overlay.classList.remove("active");
            if (e.dataTransfer?.files.length) {
                await uploadFiles(e.dataTransfer.files, this._folder);
                this._refresh();
            }
        });
    }

    // ── Public API ──

    show(types?: string[]) {
        this._types = types ?? ["folder", "image", "other"];
        this._folder = null;
        this._breadcrumb = [];
        this._selectedItem = null;
        this._updateSelectButton();
        this._dialog?.showModal();
        this._refresh();
    }

    private async _refresh() {
        this._items = await this._fetchItems();
        this._selectedItem = null;
        this._updateSelectButton();
        this._render();
    }

    private async _fetchItems(): Promise<MediaItem[]> {
        return fetchItems(this._folder, this._types as LocalTypeFilter);
    }

    private _render() {
        renderGrid(this._grid!, this._items);
        renderBreadcrumb(
            this.shadowRoot!.getElementById("breadcrumb")!,
            this._folder,
            this._breadcrumb
        );

        // Show/hide empty state
        const empty = this.shadowRoot!.getElementById("empty")!;
        empty.style.display = this._items.length === 0 ? "flex" : "none";

        // Path info
        const pathDisplay = this.shadowRoot!.getElementById("pathDisplay")!;
        if (this._breadcrumb.length > 0) {
            pathDisplay.textContent = this._breadcrumb.map(b => b.label).join(" / ");
        } else {
            pathDisplay.textContent = "Root";
        }
    }

    private _select(card: HTMLElement, id: string) {
        // Deselect previous
        this._grid!.querySelectorAll("p9r-card-media.selected").forEach(el =>
            el.classList.remove("selected")
        );

        card.classList.add("selected");
        this._selectedItem = this._items.find(i => i.id === id) || null;
        this._updateSelectButton();
    }

    private _updateSelectButton() {
        if (this._btnSelect) {
            this._btnSelect.disabled = !this._selectedItem;
        }
    }

    private _confirmSelection() {
        if (!this._selectedItem) return;
        const src = this._selectedItem.absoluteURL ?? "";
        this.dispatchEvent(new CustomEvent("select-item", {
            detail: { src, alt: this._selectedItem.label },
            bubbles: true,
            composed: true
        }));
        this._dialog?.close();
    }

    private _navigateTo(folderId: string | null, label?: string) {
        this._folder = folderId;
        if (!folderId) {
            this._breadcrumb = [];
        } else if (label) {
            this._breadcrumb.push({ id: folderId, label });
        }
        this._refresh();
    }

    private _openNewFolder() {
        const s = this.shadowRoot!;
        const backdrop = s.getElementById("nf-backdrop")!;
        const input = s.getElementById("nf-input") as HTMLInputElement;
        input.value = "";
        backdrop.classList.add("open");
        setTimeout(() => input.focus(), 50);
    }

    private async _createFolder(input: HTMLInputElement, backdrop: HTMLElement) {
        const name = input.value.trim();
        if (!name) return;
        await createFolder(name, this._folder);
        backdrop.classList.remove("open");
        this._refresh();
    }
}

customElements.define("cms-media-center", MediaCenter);
