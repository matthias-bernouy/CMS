import { Component } from "@bernouy/components/base";
import type { DashboardWidget } from "@bernouy/cms-dashboards";
import { emitWidgetEvent, WIDGET_ROW_SELECT_EVENT, setText } from "../shared";
import { arrayAt } from "../../runtime/expressions";
import { tableData } from "../../runtime/mapping";
import { appendTableCellValue, cellText } from "./cells";
import type { WTableColumn, WTableData, WTableRow } from "./types";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class DashboardWTable extends Component {
    private value: WTableData = { title: "", columns: [], rows: [], statusOptions: [], sortOptions: [] };
    private selectedRow = "";
    private bound = false;
    private lightDomObserver: MutationObserver | null = null;

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    set data(value: WTableData) {
        this.value = value;
        if (this.isConnected) this.render();
    }

    set selected(value: string) {
        this.selectedRow = value;
        if (this.isConnected) this.renderRows();
    }

    static get observedAttributes(): string[] {
        return ["data-config-json", "data-source-json", "data-selected"];
    }

    attributeChangedCallback(): void {
        this.syncBoundData();
    }

    override connectedCallback(): void {
        if (!this.bound) {
            this.shadowRoot!.addEventListener("click", this.onClick);
            this.shadowRoot!.addEventListener("input", this.onFilter);
            this.shadowRoot!.addEventListener("change", this.onFilter);
            this.lightDomObserver = new MutationObserver(() => this.syncBoundData());
            this.lightDomObserver.observe(this, { attributes: true, childList: true, subtree: true });
            this.bound = true;
        }
        this.syncBoundData();
        this.render();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener("input", this.onFilter);
        this.shadowRoot?.removeEventListener("change", this.onFilter);
        this.lightDomObserver?.disconnect();
        this.lightDomObserver = null;
        this.bound = false;
    }

    private render(): void {
        setText(this.shadowRoot!, "[data-title]", this.value.title);
        setText(this.shadowRoot!, "[data-subtitle]", this.value.subtitle ?? "");
        this.fillOptions(this.query("[data-status]"), this.value.statusOptions);
        this.fillOptions(this.query("[data-sort]"), this.value.sortOptions);
        this.renderColumns();
        this.renderRows();
    }

    private renderColumns(): void {
        const colgroup = this.query<HTMLTableColElement>("[data-colgroup]");
        const head = this.query<HTMLTableRowElement>("[data-head-row]");
        colgroup.querySelectorAll("col:not(.w-table-check-col)").forEach(col => col.remove());
        head.querySelectorAll("th:not(.check-cell)").forEach(th => th.remove());
        for (const column of this.value.columns) {
            const col = document.createElement("col");
            if (column.width) col.style.width = column.width;
            colgroup.append(col);
            const th = document.createElement("th");
            th.scope = "col";
            th.textContent = column.label;
            head.append(th);
        }
    }

    private renderRows(): void {
        const body = this.query<HTMLTableSectionElement>("[data-body]");
        const rows = this.visibleRows();
        body.replaceChildren(...rows.map(row => this.renderRow(row)));
        this.query<HTMLElement>("[data-empty]").hidden = rows.length > 0;
    }

    private renderRow(row: WTableRow): HTMLTableRowElement {
        const tr = document.createElement("tr");
        tr.dataset.collection = row.collection;
        tr.dataset.rowKey = row.id;
        tr.tabIndex = 0;
        tr.setAttribute("aria-selected", String(row.id === this.selectedRow));
        tr.append(this.checkboxCell(row), ...this.value.columns.map(column => this.renderCell(row, column)));
        return tr;
    }

    private checkboxCell(row: WTableRow): HTMLTableCellElement {
        const td = document.createElement("td");
        td.className = "check-cell";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.ariaLabel = `Select row ${row.id}`;
        td.append(input);
        return td;
    }

    private renderCell(row: WTableRow, column: WTableColumn): HTMLTableCellElement {
        const td = document.createElement("td");
        appendTableCellValue(td, row.cells[column.key], Boolean(column.primary));
        return td;
    }

    private visibleRows(): WTableRow[] {
        const search = this.query<HTMLInputElement>("[data-search]").value.trim().toLowerCase();
        const status = this.query<HTMLSelectElement>("[data-status]").value;
        const rows = this.value.rows.filter(row => this.rowMatches(row, search, status));
        return this.sortRows(rows, this.query<HTMLSelectElement>("[data-sort]").value);
    }

    private rowMatches(row: WTableRow, search: string, status: string): boolean {
        const haystack = Object.values(row.cells).map(cellText).join(" ").toLowerCase();
        const rowStatus = cellText(row.cells.status).toLowerCase();
        return (!search || haystack.includes(search)) && (!status || rowStatus === status);
    }

    private sortRows(rows: WTableRow[], sort: string): WTableRow[] {
        const [key, direction] = sort.split("-");
        if (!key) return rows;
        return rows.slice().sort((left, right) => {
            const result = cellText(left.cells[key]).localeCompare(cellText(right.cells[key]));
            return direction === "desc" ? -result : result;
        });
    }

    private fillOptions(select: HTMLSelectElement, options: Array<{ label: string; value: string }>): void {
        select.replaceChildren(...options.map(option => {
            const element = document.createElement("option");
            element.value = option.value;
            element.textContent = option.label;
            return element;
        }));
    }

    private syncBoundData(): void {
        const widget = parseJson<TableWidget>(this.dataset.configJson ?? "");
        if (!widget || widget.widget !== "w-table") return;
        const data = parseJson<unknown>(this.dataset.sourceJson ?? "");
        this.selectedRow = this.dataset.selected ?? "";
        const lightRows = this.boundRows(widget);
        this.value = {
            ...tableData(widget, lightRows.length ? [] : arrayAt(data, widget.source.itemsPath)),
            rows: lightRows.length ? lightRows : tableData(widget, arrayAt(data, widget.source.itemsPath)).rows,
        };
    }

    private boundRows(widget: TableWidget): WTableRow[] {
        return Array.from(this.querySelectorAll<HTMLElement>("[data-table-row]"))
            .map(row => lightRow(widget, row))
            .filter((row): row is WTableRow => row !== null);
    }

    private onFilter = (): void => this.renderRows();

    private onClick = (event: Event): void => {
        const target = event.target as Element | null;
        const selectAll = target?.closest<HTMLInputElement>("[data-select-all]");
        if (selectAll) this.shadowRoot!.querySelectorAll<HTMLInputElement>("tbody input").forEach(input => { input.checked = selectAll.checked; });
        if (target?.closest("input")) return;
        const row = target?.closest<HTMLTableRowElement>("tr[data-row-key]");
        if (!row?.dataset.collection || !row.dataset.rowKey) return;
        emitWidgetEvent(this, WIDGET_ROW_SELECT_EVENT, { collection: row.dataset.collection, rowKey: row.dataset.rowKey });
    };

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector(selector) as T;
    }
}

if (!customElements.get("cms-dashboard-w-table")) customElements.define("cms-dashboard-w-table", DashboardWTable);

export type { WTableColumn, WTableData, WTableRow };

type TableWidget = Extract<DashboardWidget, { widget: "w-table" }>;

function parseJson<T>(value: string): T | null {
    if (!value) return null;
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function lightRow(widget: TableWidget, row: HTMLElement): WTableRow | null {
    const id = row.dataset.rowId ?? "";
    if (!id) return null;
    return {
        id,
        collection: row.dataset.collection || widget.selection?.opens || widget.id,
        cells: Object.fromEntries(widget.columns.map(column => [column.id, lightCell(row, column)])),
    };
}

function lightCell(row: HTMLElement, column: TableWidget["columns"][number]): WTableRow["cells"][string] {
    const element = Array.from(row.querySelectorAll<HTMLElement>("[data-table-cell]"))
        .find(cell => cell.dataset.tableCell === column.id);
    const title = element?.dataset.title ?? "";
    if (!element) return title;
    if (element.dataset.tone === "badge") return { title, tone: "badge" };
    if (element.dataset.primary === "true") return { title, meta: element.dataset.meta ?? "" };
    return title;
}
