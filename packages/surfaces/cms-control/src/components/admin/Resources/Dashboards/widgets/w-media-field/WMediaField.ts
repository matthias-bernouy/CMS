import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import { MediaDragController } from "./drag";
import { renderAddTile, renderMediaTile } from "./render";
import { W_MEDIA_FIELD_ACTION_EVENT, type DashboardMediaAction, type DashboardMediaActionDetail, type DashboardMediaItem } from "./types";
import { localId, numberData, tileFromEvent } from "./utils";

type PendingPick = { action: "upload"; index?: never } | { action: "replace"; index: number };

export class DashboardWMediaField extends Component {
    private currentItems: DashboardMediaItem[] = [];
    private drag = new MediaDragController(() => this.shadowRoot!, (from, to) => this.move(from, to), value => { this.suppressClick = value; });
    private localUrls = new Set<string>();
    private pendingPick: PendingPick = { action: "upload" };
    private suppressClick = false;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    static get observedAttributes(): string[] { return ["label", "accept"]; }

    override connectedCallback(): void {
        this.query<HTMLInputElement>("[data-file]").addEventListener("change", this.onFileChange);
        this.shadowRoot!.addEventListener("click", this.onClick);
        this.shadowRoot!.addEventListener("dragstart", this.drag.start);
        this.shadowRoot!.addEventListener("dragover", this.drag.over);
        this.shadowRoot!.addEventListener("drop", this.drag.drop);
        this.shadowRoot!.addEventListener("dragend", this.drag.end);
        this.sync();
    }

    disconnectedCallback(): void {
        this.query<HTMLInputElement>("[data-file]").removeEventListener("change", this.onFileChange);
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener("dragstart", this.drag.start);
        this.shadowRoot?.removeEventListener("dragover", this.drag.over);
        this.shadowRoot?.removeEventListener("drop", this.drag.drop);
        this.shadowRoot?.removeEventListener("dragend", this.drag.end);
    }

    attributeChangedCallback(): void { if (this.isConnected) this.sync(); }

    get items(): DashboardMediaItem[] { return this.currentItems.map(item => ({ ...item })); }
    set items(value: DashboardMediaItem[]) {
        this.currentItems = value.map(item => ({ ...item }));
        if (this.isConnected) this.sync();
    }

    private sync(): void {
        this.query<HTMLElement>("[data-label]").textContent = this.getAttribute("label") ?? "";
        this.renderGrid();
    }

    private renderGrid(): void {
        const grid = this.query<HTMLElement>("[data-grid]");
        grid.replaceChildren(...this.currentItems.map(renderMediaTile), renderAddTile());
    }

    private onClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-media-action]");
        if (button?.dataset.mediaAction === "upload") return this.openPicker({ action: "upload" });
        if (button?.dataset.mediaAction === "remove") {
            const index = numberData(button.dataset.index);
            if (index !== null) this.removeItem(index);
            return;
        }
        const tile = tileFromEvent(event);
        const index = numberData(tile?.dataset.index);
        if (!this.suppressClick && index !== null) this.openPicker({ action: "replace", index });
    };

    private openPicker(pick: PendingPick): void {
        const input = this.query<HTMLInputElement>("[data-file]");
        this.pendingPick = pick;
        input.value = "";
        input.accept = this.getAttribute("accept") ?? "image/*";
        input.multiple = pick.action === "upload";
        input.click();
    }

    private onFileChange = (event: Event): void => {
        event.stopPropagation();
        const files = Array.from(this.query<HTMLInputElement>("[data-file]").files ?? []);
        if (!files.length) return;
        const [file] = files;
        if (!file) return;
        this.pendingPick.action === "replace" ? this.replace(this.pendingPick.index, file) : this.upload(files);
    };

    private upload(files: File[]): void {
        const inserted = files.map(file => this.itemFromFile(file));
        this.currentItems = [...this.currentItems, ...inserted];
        this.changed("upload", { files });
    }

    private replace(index: number, file: File): void {
        const previousItem = this.currentItems[index];
        if (!previousItem) return;
        const item = { ...previousItem, ...this.itemFromFile(file), id: previousItem.id };
        this.revokeLocalUrl(previousItem.url);
        this.currentItems = this.currentItems.map((entry, entryIndex) => entryIndex === index ? item : entry);
        this.changed("replace", { index, item, previousItem, file });
    }

    private removeItem(index: number): void {
        const item = this.currentItems[index];
        if (!item) return;
        this.revokeLocalUrl(item.url);
        this.currentItems = this.currentItems.filter((_, entryIndex) => entryIndex !== index);
        this.changed("remove", { index, item });
    }

    private move(from: number, to: number): void {
        if (from === to || to < 0 || to >= this.currentItems.length) return;
        const next = [...this.currentItems];
        const [item] = next.splice(from, 1);
        if (!item) return;
        next.splice(to, 0, item);
        this.currentItems = next;
        this.changed("reorder", { from, to, item });
    }

    private itemFromFile(file: File): DashboardMediaItem {
        const url = URL.createObjectURL(file);
        this.localUrls.add(url);
        return { id: `local-${localId()}`, url, thumbnailUrl: url, alt: file.name, name: file.name, pending: true };
    }

    private changed(action: DashboardMediaAction, detail: Partial<DashboardMediaActionDetail>): void {
        this.renderGrid();
        this.dispatchEvent(new CustomEvent(W_MEDIA_FIELD_ACTION_EVENT, { bubbles: true, composed: true, detail: { ...detail, action, value: this.items } }));
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }

    private revokeLocalUrl(url: string | undefined): void {
        if (!url || !this.localUrls.has(url)) return;
        URL.revokeObjectURL(url);
        this.localUrls.delete(url);
    }

    private query<T extends Element>(selector: string): T { return this.shadowRoot!.querySelector(selector) as T; }
}

if (!customElements.get("cms-dashboard-w-media-field")) customElements.define("cms-dashboard-w-media-field", DashboardWMediaField);
