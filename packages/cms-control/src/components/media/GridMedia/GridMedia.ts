import template from './view/template.html' with { type: 'text' };
import css from './view/style.css' with { type: 'text' };
import { Component } from "@bernouy/cms/component";
import type { DetailMedia } from "../DetailMedia/DetailMedia";
import type { CropSystem } from "../CropSystem/CropSystem";
import type { MediaItem, BreadcrumbEntry } from "./types";
import * as api from "./api";
import { renderGrid, renderBreadcrumb } from "./view/render";
import { setupFeatures } from "./features/setup";
import { wireGrid } from "./events/grid";
import { wireBreadcrumb } from "./events/breadcrumb";

export class GridMedia extends Component {

    _folder: string | null = null;
    _breadcrumb: BreadcrumbEntry[] = [];
    _items: MediaItem[] = [];

    constructor() {
        super({
            css: css as unknown as string,
            template: template as unknown as string,
        });
    }

    get detail() { return this.shadowRoot!.getElementById("detail") as unknown as DetailMedia; }
    get crop()   { return this.shadowRoot!.getElementById("crop")   as unknown as CropSystem; }

    override connectedCallback() {
        const s = this.shadowRoot!;
        this._folder = new URL(window.location.href).searchParams.get("folder");

        const f = setupFeatures(this, s);
        wireGrid(this, s, f.ctxMenu, f.detail);
        wireBreadcrumb(this, s);
        this.upload = () => f.dragDrop.trigger();

        if (this._folder) {
            api.resolveBreadcrumbTrail(this._folder).then((trail) => {
                this._breadcrumb = trail;
                this._render();
            });
        }
        this._refresh();
    }

    upload() {}

    refresh() { this._refresh(); }

    async _refresh() {
        this._items = await api.fetchItems(this._folder);
        this._render();
    }

    _render() {
        renderGrid(this.shadowRoot!.getElementById("grid")!, this._items);
        renderBreadcrumb(this.shadowRoot!.getElementById("breadcrumb")!, this._folder, this._breadcrumb);
    }

    _navigateTo(folderId: string | null, label?: string) {
        const url = new URL(window.location.href);
        if (folderId) url.searchParams.set("folder", folderId);
        else          url.searchParams.delete("folder");
        window.history.pushState({}, "", url.toString());

        this._folder = folderId;
        if (!folderId) this._breadcrumb = [];
        else if (label) this._breadcrumb.push({ id: folderId, label });

        this._refresh();
    }

    async _confirmDelete(id: string) {
        if (!confirm("Delete this item?")) return;
        if (await api.deleteItem(id)) this._refresh();
    }
}

if (!customElements.get("p9r-grid-media")) {
    customElements.define("p9r-grid-media", GridMedia);
}
