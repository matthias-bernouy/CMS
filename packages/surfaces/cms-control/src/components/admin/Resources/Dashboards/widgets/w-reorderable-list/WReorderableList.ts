import { Component } from "@bernouy/components/base";
import { W_MEDIA_FIELD_ACTION_EVENT, type DashboardMediaActionDetail } from "../w-media-field/types";
import { readItemControl } from "./controls";
import { scopeMediaAction } from "./mediaAction";
import {
    addItem,
    cloneData,
    cloneItems,
    emptyData,
    moveItem,
    normalizeData,
    persistPositions,
    removeItem,
    updateItem,
    type ReorderableListData,
    type ReorderableListItem,
} from "./state";
import { clearDragState, draggedRow, markDropTarget, renderList } from "./view";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export type { ReorderableListData, ReorderableListItem, ReorderableListItemField } from "./state";

export class DashboardWReorderableList extends Component {
    private value: ReorderableListData = emptyData();
    private draggingIndex: number | null = null;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.shadowRoot!.addEventListener("click", this.onClick);
        this.shadowRoot!.addEventListener("input", this.onInput);
        this.shadowRoot!.addEventListener("change", this.onInput);
        this.shadowRoot!.addEventListener(W_MEDIA_FIELD_ACTION_EVENT, this.onMediaAction as EventListener);
        this.shadowRoot!.addEventListener("dragstart", this.onDragStart as EventListener);
        this.shadowRoot!.addEventListener("dragover", this.onDragOver as EventListener);
        this.shadowRoot!.addEventListener("drop", this.onDrop as EventListener);
        this.shadowRoot!.addEventListener("dragend", this.onDragEnd);
        this.render();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener("input", this.onInput);
        this.shadowRoot?.removeEventListener("change", this.onInput);
        this.shadowRoot?.removeEventListener(W_MEDIA_FIELD_ACTION_EVENT, this.onMediaAction as EventListener);
        this.shadowRoot?.removeEventListener("dragstart", this.onDragStart as EventListener);
        this.shadowRoot?.removeEventListener("dragover", this.onDragOver as EventListener);
        this.shadowRoot?.removeEventListener("drop", this.onDrop as EventListener);
        this.shadowRoot?.removeEventListener("dragend", this.onDragEnd);
    }

    get data(): ReorderableListData {
        return cloneData(this.value);
    }
    set data(value: ReorderableListData) {
        this.value = normalizeData(value);
        if (this.isConnected) {
            this.render();
        }
    }

    get items(): ReorderableListItem[] {
        return cloneItems(this.value);
    }

    private render(): void {
        renderList(this.shadowRoot!, this.value);
    }

    private onClick = (event: Event): void => {
        const target = event.target as Element | null;
        if (target?.closest("[data-add]")) {
            return this.addItem();
        }
        const remove = target?.closest<HTMLButtonElement>("[data-remove]");
        if (remove) {
            return this.removeItem(Number(remove.dataset.remove));
        }
    };

    private onInput = (event: Event): void => {
        const input = (event.target as Element | null)?.closest<HTMLElement>("[data-item-index][data-item-path]");
        if (!input) {
            return;
        }
        if (this.value.fields.some((field) => field.id === input.dataset.itemField && field.type === "media")) {
            return;
        }
        const index = Number(input.dataset.itemIndex);
        if (updateItem(this.value, index, input.dataset.itemPath ?? "", readItemControl(input))) {
            this.commit(false);
        }
    };

    private onMediaAction = (event: CustomEvent<DashboardMediaActionDetail>): void => {
        const detail = scopeMediaAction(this.value, event);
        if (!detail) {
            return;
        }
        event.stopPropagation();
        this.commit(false);
        this.dispatchEvent(
            new CustomEvent(W_MEDIA_FIELD_ACTION_EVENT, {
                bubbles: true,
                composed: true,
                detail,
            }),
        );
    };

    private onDragStart = (event: DragEvent): void => {
        const handle = (event.target as Element | null)?.closest<HTMLElement>(".handle");
        const row = handle ? draggedRow(event) : null;
        if (!row) {
            return;
        }
        this.draggingIndex = Number(row.dataset.index);
        row.dataset.dragging = "";
        event.dataTransfer?.setData("text/plain", String(this.draggingIndex));
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
        }
    };

    private onDragOver = (event: DragEvent): void => {
        const row = draggedRow(event);
        if (!row || this.draggingIndex === null) {
            return;
        }
        event.preventDefault();
        markDropTarget(this.shadowRoot!, row);
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = "move";
        }
    };

    private onDrop = (event: DragEvent): void => {
        const row = draggedRow(event);
        if (!row || this.draggingIndex === null) {
            return;
        }
        event.preventDefault();
        if (moveItem(this.value, this.draggingIndex, Number(row.dataset.index))) {
            this.commit();
        }
        this.clearDragState();
    };

    private onDragEnd = (): void => this.clearDragState();

    private addItem(): void {
        if (addItem(this.value)) {
            this.commit();
        }
    }

    private removeItem(index: number): void {
        if (removeItem(this.value, index)) {
            this.commit();
        }
    }

    private commit(render = true): void {
        persistPositions(this.value);
        if (render) {
            this.render();
        }
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }

    private clearDragState(): void {
        this.draggingIndex = null;
        clearDragState(this.shadowRoot!);
    }
}

if (!customElements.get("cms-dashboard-w-reorderable-list")) {
    customElements.define("cms-dashboard-w-reorderable-list", DashboardWReorderableList);
}
