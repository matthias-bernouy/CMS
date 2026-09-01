import { Component } from "@bernouy/components/base";
import css from "./styles";
import template from "./template.html" with { type: "text" };
import { MediaDragController } from "./controllers/drag";
import { MediaPreviewController } from "./controllers/preview";
import { dispatchMediaChange, LocalMediaFiles } from "./mediaState";
import { renderAddTile, renderMediaTile } from "./render";
import { type DashboardMediaAction, type DashboardMediaActionDetail, type DashboardMediaItem } from "./types";
import { numberData, tileFromEvent } from "./utils";

type PendingPick = { action: "upload"; index?: never } | { action: "replace"; index: number };

export class DashboardWMediaField extends Component {
    private currentItems: DashboardMediaItem[] = [];
    private drag = new MediaDragController(
        () => this.shadowRoot!,
        (from, to) => this.move(from, to),
        (value) => {
            this.suppressClick = value;
        },
    );
    private readonly localFiles = new LocalMediaFiles();
    private readonly preview: MediaPreviewController;
    private pendingPick: PendingPick = { action: "upload" };
    private suppressClick = false;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
        this.preview = new MediaPreviewController(this.shadowRoot!, () => this.currentItems);
    }

    static get observedAttributes(): string[] {
        return ["label", "accept", "layout", "multiple"];
    }

    override connectedCallback(): void {
        this.query<HTMLInputElement>("[data-file]").addEventListener("change", this.onFileChange);
        this.shadowRoot!.addEventListener("click", this.onClick);
        this.shadowRoot!.addEventListener("dragstart", this.drag.start);
        this.shadowRoot!.addEventListener("dragover", this.drag.over);
        this.shadowRoot!.addEventListener("drop", this.drag.drop);
        this.shadowRoot!.addEventListener("dragend", this.drag.end);
        this.preview.connect();
        this.sync();
    }

    disconnectedCallback(): void {
        this.query<HTMLInputElement>("[data-file]").removeEventListener("change", this.onFileChange);
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener("dragstart", this.drag.start);
        this.shadowRoot?.removeEventListener("dragover", this.drag.over);
        this.shadowRoot?.removeEventListener("drop", this.drag.drop);
        this.shadowRoot?.removeEventListener("dragend", this.drag.end);
        this.preview.disconnect();
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.sync();
        }
    }

    get items(): DashboardMediaItem[] {
        return this.currentItems.map((item) => ({ ...item }));
    }
    set items(value: DashboardMediaItem[]) {
        this.currentItems = value.map((item) => ({ ...item }));
        if (this.isConnected) {
            this.sync();
        }
    }

    private sync(): void {
        this.query<HTMLElement>("[data-label]").textContent = this.getAttribute("label") ?? "";
        this.renderGrid();
        this.preview.sync();
    }

    private renderGrid(): void {
        const grid = this.query<HTMLElement>("[data-grid]");
        const add = this.hasAttribute("multiple") || this.currentItems.length === 0 ? [renderAddTile()] : [];
        grid.replaceChildren(...this.currentItems.map(renderMediaTile), ...add);
    }

    private onClick = (event: Event): void => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("[data-media-action]");
        if (button?.dataset.mediaAction === "upload") {
            return this.openPicker({ action: "upload" });
        }
        if (button?.dataset.mediaAction === "remove") {
            const index = numberData(button.dataset.index);
            if (index !== null) {
                this.removeItem(index);
            }
            return;
        }
        const tile = tileFromEvent(event);
        const index = numberData(tile?.dataset.index);
        if (!this.suppressClick && index !== null) {
            this.openPicker({ action: "replace", index });
        }
    };

    private openPicker(pick: PendingPick): void {
        const input = this.query<HTMLInputElement>("[data-file]");
        this.pendingPick = pick;
        input.value = "";
        input.accept = this.getAttribute("accept") ?? "image/*";
        input.multiple = pick.action === "upload" && this.hasAttribute("multiple");
        input.click();
    }

    private onFileChange = (event: Event): void => {
        event.stopPropagation();
        const files = Array.from(this.query<HTMLInputElement>("[data-file]").files ?? []);
        if (!files.length) {
            return;
        }
        const [file] = files;
        if (!file) {
            return;
        }
        this.pendingPick.action === "replace"
            ? this.replace(this.pendingPick.index, file)
            : this.upload(this.hasAttribute("multiple") ? files : [file]);
    };

    private upload(files: File[]): void {
        const inserted = files.map((file) => this.localFiles.create(file));
        this.currentItems = [...this.currentItems, ...inserted];
        this.changed("upload", { files });
    }

    private replace(index: number, file: File): void {
        const previousItem = this.currentItems[index];
        if (!previousItem) {
            return;
        }
        const item = { ...previousItem, ...this.localFiles.create(file), id: previousItem.id };
        this.localFiles.revoke(previousItem.url);
        this.currentItems = this.currentItems.map((entry, entryIndex) => (entryIndex === index ? item : entry));
        this.changed("replace", { index, item, previousItem, file });
    }

    private removeItem(index: number): void {
        const item = this.currentItems[index];
        if (!item) {
            return;
        }
        this.localFiles.revoke(item.url);
        this.currentItems = this.currentItems.filter((_, entryIndex) => entryIndex !== index);
        this.changed("remove", { index, item });
    }

    private move(from: number, to: number): void {
        if (from === to || to < 0 || to >= this.currentItems.length) {
            return;
        }
        const next = [...this.currentItems];
        const [item] = next.splice(from, 1);
        if (!item) {
            return;
        }
        next.splice(to, 0, item);
        this.currentItems = next;
        this.changed("reorder", { from, to, item });
    }

    private changed(action: DashboardMediaAction, detail: Partial<DashboardMediaActionDetail>): void {
        this.renderGrid();
        this.preview.sync();
        dispatchMediaChange(this, action, this.items, detail);
    }

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector(selector) as T;
    }
}

if (!customElements.get("cms-dashboard-w-media-field")) {
    customElements.define("cms-dashboard-w-media-field", DashboardWMediaField);
}
