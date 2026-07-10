import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export type ReorderableListItem = Record<string, unknown>;

export type ReorderableListItemField = {
    id: string;
    label: string;
    path: string;
    required?: boolean;
    placeholder?: string;
};

export type ReorderableListData = {
    items: ReorderableListItem[];
    itemKey: string;
    positionPath?: string;
    fields: ReorderableListItemField[];
    addLabel?: string;
    minItems?: number;
    maxItems?: number;
};

export class DashboardWReorderableList extends Component {
    private value: ReorderableListData = { items: [], itemKey: "id", fields: [] };
    private draggingIndex: number | null = null;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this.shadowRoot!.addEventListener("click", this.onClick);
        this.shadowRoot!.addEventListener("input", this.onInput);
        this.shadowRoot!.addEventListener("dragstart", this.onDragStart as EventListener);
        this.shadowRoot!.addEventListener("dragover", this.onDragOver as EventListener);
        this.shadowRoot!.addEventListener("drop", this.onDrop as EventListener);
        this.shadowRoot!.addEventListener("dragend", this.onDragEnd);
        this.render();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener("input", this.onInput);
        this.shadowRoot?.removeEventListener("dragstart", this.onDragStart as EventListener);
        this.shadowRoot?.removeEventListener("dragover", this.onDragOver as EventListener);
        this.shadowRoot?.removeEventListener("drop", this.onDrop as EventListener);
        this.shadowRoot?.removeEventListener("dragend", this.onDragEnd);
    }

    get data(): ReorderableListData { return cloneData(this.value); }
    set data(value: ReorderableListData) {
        this.value = normalizeData(value);
        if (this.isConnected) this.render();
    }

    get items(): ReorderableListItem[] { return this.value.items.map(item => ({ ...item })); }

    private render(): void {
        const rows = this.query<HTMLElement>("[data-rows]");
        rows.replaceChildren(...this.value.items.map((item, index) => this.renderRow(item, index)));
        this.renderHeader();
        const add = this.query<HTMLButtonElement>("[data-add]");
        add.textContent = this.value.addLabel ?? "Add item";
        add.disabled = this.value.maxItems !== undefined && this.value.items.length >= this.value.maxItems;
    }

    private renderHeader(): void {
        const header = this.query<HTMLElement>("[data-header]");
        header.style.setProperty(
            "--reorderable-columns",
            ["24px", ...this.value.fields.map(() => "minmax(0, 1fr)"), "32px"].join(" "),
        );
        const cells = [document.createElement("span")];
        for (const field of this.value.fields) {
            const cell = document.createElement("span");
            cell.textContent = field.label;
            cells.push(cell);
        }
        cells.push(document.createElement("span"));
        header.replaceChildren(...cells);
    }

    private renderRow(item: ReorderableListItem, index: number): HTMLElement {
        const row = document.createElement("div");
        row.className = "row";
        row.dataset.index = String(index);
        row.dataset.itemKey = String(item[this.value.itemKey] ?? index);
        row.style.setProperty(
            "--reorderable-columns",
            ["24px", ...this.value.fields.map(() => "minmax(0, 1fr)"), "32px"].join(" "),
        );

        const handle = document.createElement("span");
        handle.className = "handle";
        handle.title = "Drag to reorder";
        handle.setAttribute("aria-label", "Drag to reorder");
        handle.draggable = true;
        handle.textContent = "⠿";
        row.append(handle);

        for (const field of this.value.fields) row.append(this.renderField(item, index, field));

        const remove = document.createElement("button");
        remove.className = "remove";
        remove.type = "button";
        remove.dataset.remove = String(index);
        remove.disabled = this.value.minItems !== undefined && this.value.items.length <= this.value.minItems;
        remove.setAttribute("aria-label", "Remove item");
        remove.title = "Remove item";
        remove.textContent = "×";
        row.append(remove);
        return row;
    }

    private renderField(item: ReorderableListItem, index: number, field: ReorderableListItemField): HTMLElement {
        const root = document.createElement("div");
        root.className = "field";
        const input = document.createElement("input");
        input.type = "text";
        input.value = textAt(item, field.path);
        input.dataset.itemIndex = String(index);
        input.dataset.itemPath = field.path;
        input.setAttribute("aria-label", field.label);
        if (field.required) input.required = true;
        if (field.placeholder) input.placeholder = field.placeholder;
        root.append(input);
        return root;
    }

    private onClick = (event: Event): void => {
        const target = event.target as Element | null;
        if (target?.closest("[data-add]")) return this.addItem();
        const remove = target?.closest<HTMLButtonElement>("[data-remove]");
        if (remove) return this.removeItem(Number(remove.dataset.remove));
    };

    private onInput = (event: Event): void => {
        const input = (event.target as Element | null)?.closest<HTMLInputElement>("[data-item-index][data-item-path]");
        if (!input) return;
        const index = Number(input.dataset.itemIndex);
        const item = this.value.items[index];
        if (!item) return;
        setAt(item, input.dataset.itemPath ?? "", input.value);
        this.commit(false);
    };

    private onDragStart = (event: DragEvent): void => {
        const handle = (event.target as Element | null)?.closest<HTMLElement>(".handle");
        const row = handle?.closest<HTMLElement>(".row[data-index]");
        if (!row) return;
        this.draggingIndex = Number(row.dataset.index);
        row.dataset.dragging = "";
        event.dataTransfer?.setData("text/plain", String(this.draggingIndex));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    };

    private onDragOver = (event: DragEvent): void => {
        const row = (event.target as Element | null)?.closest<HTMLElement>(".row[data-index]");
        if (!row || this.draggingIndex === null) return;
        event.preventDefault();
        this.rows().forEach(candidate => candidate.toggleAttribute("data-drop-target", candidate === row));
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    };

    private onDrop = (event: DragEvent): void => {
        const row = (event.target as Element | null)?.closest<HTMLElement>(".row[data-index]");
        if (!row || this.draggingIndex === null) return;
        event.preventDefault();
        const targetIndex = Number(row.dataset.index);
        this.moveItem(this.draggingIndex, targetIndex);
        this.clearDragState();
    };

    private onDragEnd = (): void => this.clearDragState();

    private addItem(): void {
        if (this.value.maxItems !== undefined && this.value.items.length >= this.value.maxItems) return;
        this.value.items.push({});
        this.commit();
    }

    private removeItem(index: number): void {
        if (!Number.isInteger(index) || (this.value.minItems !== undefined && this.value.items.length <= this.value.minItems)) return;
        this.value.items.splice(index, 1);
        this.commit();
    }

    private moveItem(from: number, to: number): void {
        if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || to < 0 || to >= this.value.items.length) return;
        const [item] = this.value.items.splice(from, 1);
        if (!item) return;
        this.value.items.splice(to, 0, item);
        this.commit();
    }

    private commit(render = true): void {
        const positionPath = this.value.positionPath ?? "position";
        this.value.items.forEach((item, index) => setAt(item, positionPath, index));
        if (render) this.render();
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    }

    private clearDragState(): void {
        this.draggingIndex = null;
        this.rows().forEach(row => {
            row.removeAttribute("data-dragging");
            row.removeAttribute("data-drop-target");
        });
    }

    private rows(): HTMLElement[] { return Array.from(this.shadowRoot!.querySelectorAll<HTMLElement>(".row")); }
    private query<T extends Element>(selector: string): T { return this.shadowRoot!.querySelector(selector) as T; }
}

if (!customElements.get("cms-dashboard-w-reorderable-list")) {
    customElements.define("cms-dashboard-w-reorderable-list", DashboardWReorderableList);
}

function normalizeData(value: ReorderableListData): ReorderableListData {
    return {
        ...value,
        items: Array.isArray(value.items) ? value.items.filter(isRecord).map(item => ({ ...item })) : [],
        fields: Array.isArray(value.fields) ? value.fields.map(field => ({ ...field })) : [],
    };
}

function cloneData(value: ReorderableListData): ReorderableListData {
    return { ...value, items: value.items.map(item => ({ ...item })), fields: value.fields.map(field => ({ ...field })) };
}

function isRecord(value: unknown): value is ReorderableListItem {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function textAt(value: unknown, path: string): string {
    const resolved = path.split(".").filter(Boolean).reduce<unknown>((current, part) => isRecord(current) ? current[part] : undefined, value);
    return resolved === null || resolved === undefined ? "" : String(resolved);
}

function setAt(target: ReorderableListItem, path: string, value: unknown): void {
    const parts = path.split(".").filter(Boolean);
    if (!parts.length) return;
    let current: ReorderableListItem = target;
    for (const part of parts.slice(0, -1)) {
        const existing = current[part];
        if (!isRecord(existing)) current[part] = {};
        current = current[part] as ReorderableListItem;
    }
    current[parts.at(-1)!] = value;
}
