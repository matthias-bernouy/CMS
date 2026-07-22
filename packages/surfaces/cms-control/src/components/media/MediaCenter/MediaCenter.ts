import html from "./template.html" with { type: "text" };
import chromeCss from "./styles/chrome.css" with { type: "text" };
import contentCss from "./styles/content.css" with { type: "text" };
import folderCss from "./styles/folder.css" with { type: "text" };
import { Component } from "@bernouy/components/base";

import "cms-control/components/media/CardMedia/CardMedia";
import type { MediaItem, BreadcrumbEntry } from "cms-control/components/media/GridMedia/types";
import { createFolder, fetchItems, type LocalTypeFilter } from "cms-control/components/media/GridMedia/api";
import { renderBreadcrumb, renderGrid } from "../GridMedia/view/render";
import { wireMediaCenterEvents } from "./events";

export class MediaCenter extends Component {
    private _dialog: HTMLDialogElement | null = null;
    private _grid: HTMLElement | null = null;
    private _btnSelect: HTMLButtonElement | null = null;

    private _folder: string | null = null;
    private _breadcrumb: BreadcrumbEntry[] = [];
    private _items: MediaItem[] = [];
    private _selectedItem: MediaItem | null = null;
    private _types: string[] = [];
    constructor() {
        super({
            css: [chromeCss, contentCss, folderCss].join("\n"),
            template: html as unknown as string,
        });
    }

    override connectedCallback() {
        const s = this.shadowRoot!;
        this._dialog = s.querySelector("dialog");
        this._grid = s.getElementById("grid");
        this._btnSelect = s.getElementById("btnSelect") as HTMLButtonElement;

        this._btnSelect!.addEventListener("click", () => this._confirmSelection());
        wireMediaCenterEvents({
            root: s,
            dialog: this._dialog!,
            grid: this._grid!,
            getFolder: () => this._folder,
            findItem: (id) => this._items.find((item) => item.id === id),
            navigate: (folderId, label) => this._navigateTo(folderId, label),
            navigateBreadcrumb: (folderId, index) => {
                this._breadcrumb = this._breadcrumb.slice(0, index + 1);
                this._navigateTo(folderId);
            },
            select: (card, id) => this._select(card, id),
            confirmSelection: () => this._confirmSelection(),
            openNewFolder: () => this._openNewFolder(),
            createFolder: (input, backdrop) => this._createFolder(input, backdrop),
            refresh: () => this._refresh(),
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
        renderBreadcrumb(this.shadowRoot!.getElementById("breadcrumb")!, this._folder, this._breadcrumb);

        const empty = this.shadowRoot!.getElementById("empty")!;
        empty.style.display = this._items.length === 0 ? "flex" : "none";

        const pathDisplay = this.shadowRoot!.getElementById("pathDisplay")!;
        if (this._breadcrumb.length > 0) {
            pathDisplay.textContent = this._breadcrumb.map((b) => b.label).join(" / ");
        } else {
            pathDisplay.textContent = "Root";
        }
    }

    private _select(card: HTMLElement, id: string) {
        this._grid!.querySelectorAll("p9r-card-media.selected").forEach((el) => el.classList.remove("selected"));

        card.classList.add("selected");
        this._selectedItem = this._items.find((i) => i.id === id) || null;
        this._updateSelectButton();
    }

    private _updateSelectButton() {
        if (this._btnSelect) {
            this._btnSelect.disabled = !this._selectedItem;
        }
    }

    private _confirmSelection() {
        if (!this._selectedItem) {
            return;
        }
        const src = this._selectedItem.absoluteURL ?? "";
        this.dispatchEvent(
            new CustomEvent("select-item", {
                // `mimetype` lets consumers gate on the real type — id URLs carry no
                // extension, so SVG detection can't sniff the URL anymore.
                detail: { src, alt: this._selectedItem.label, mimetype: this._selectedItem.mimetype },
                bubbles: true,
                composed: true,
            }),
        );
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
        if (!name) {
            return;
        }
        await createFolder(name, this._folder);
        backdrop.classList.remove("open");
        this._refresh();
    }
}

customElements.define("cms-media-center", MediaCenter);
