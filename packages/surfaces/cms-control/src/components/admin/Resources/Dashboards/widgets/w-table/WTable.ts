import { Component } from "@bernouy/components/base";
import type { DashboardWidget } from "@bernouy/cms-dashboards";
import { emitWidgetEvent, setText, WIDGET_ACTION_EVENT, WIDGET_FILTER_CHANGE_EVENT } from "../shared";
import { type DashboardWRow } from "./WRow";
import { createTableRow, renderTableColumns, tableActionButtons } from "./render";
import type { WTableColumn, WTableData, WTableRow } from "./types";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class DashboardWTable extends Component {
    private value: WTableData = { title: "", actions: [], columns: [], filters: [], filterValues: {}, rows: [] };
    private selectedRow = "";

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    set data(value: WTableData) {
        this.value = value;
        this.replaceChildren(...value.rows.map((row) => createTableRow(row, value.columns)));
        if (this.isConnected) {
            this.render();
            this.syncRows();
        }
    }

    set selected(value: string) {
        this.selectedRow = value;
        this.setAttribute("data-selected", value);
    }

    static get observedAttributes(): string[] {
        return ["data-config-json", "data-filters-json", "data-selected"];
    }

    attributeChangedCallback(): void {
        this.syncConfig();
        if (this.isConnected) {
            this.render();
        }
    }

    override connectedCallback(): void {
        this.shadowRoot!.querySelector<HTMLSlotElement>("slot")?.addEventListener("slotchange", this.onSlotChange);
        this.shadowRoot!.querySelector("[data-select-all]")?.addEventListener("change", this.onSelectAll);
        this.shadowRoot!.querySelector("[data-actions]")?.addEventListener("click", this.onActionClick);
        this.shadowRoot!.querySelector("[data-filters]")?.addEventListener("submit", this.onFilterSubmit);
        this.shadowRoot!.querySelector("[data-filter-clear]")?.addEventListener("click", this.onFilterClear);
        this.syncConfig();
        this.render();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.querySelector<HTMLSlotElement>("slot")?.removeEventListener("slotchange", this.onSlotChange);
        this.shadowRoot?.querySelector("[data-select-all]")?.removeEventListener("change", this.onSelectAll);
        this.shadowRoot?.querySelector("[data-actions]")?.removeEventListener("click", this.onActionClick);
        this.shadowRoot?.querySelector("[data-filters]")?.removeEventListener("submit", this.onFilterSubmit);
        this.shadowRoot?.querySelector("[data-filter-clear]")?.removeEventListener("click", this.onFilterClear);
    }

    private render(): void {
        setText(this.shadowRoot!, "[data-title]", this.value.title);
        setText(this.shadowRoot!, "[data-subtitle]", this.value.subtitle ?? "");
        this.query<HTMLElement>("[data-header]").hidden =
            !this.value.title && !this.value.subtitle && !this.value.actions?.length;
        this.renderActions();
        this.renderFilters();
        this.renderColumns();
        this.syncRows();
    }

    private renderActions(): void {
        const root = this.query<HTMLElement>("[data-actions]");
        root.replaceChildren(...tableActionButtons(this.value.actions ?? []));
    }

    private renderColumns(): void {
        renderTableColumns(this, this.query<HTMLElement>("[data-head-row]"), this.value.columns);
    }

    private renderFilters(): void {
        const form = this.query<HTMLFormElement>("[data-filters]");
        const filters = this.value.filters ?? [];
        form.hidden = filters.length === 0;
        const values = this.value.filterValues ?? {};
        this.query<HTMLElement>("[data-filter-fields]").replaceChildren(
            ...filters.map((filter) => {
                const label = document.createElement("label");
                label.className = "w-table-filter-field";
                const copy = document.createElement("span");
                copy.textContent = filter.label;
                let control: HTMLInputElement | HTMLSelectElement;
                if (filter.type === "select") {
                    const select = document.createElement("select");
                    const empty = document.createElement("option");
                    empty.value = "";
                    empty.textContent = "All";
                    select.append(
                        empty,
                        ...(filter.options ?? []).map((option) => {
                            const element = document.createElement("option");
                            element.value = option.value;
                            element.textContent = option.label;
                            return element;
                        }),
                    );
                    control = select;
                } else {
                    const input = document.createElement("input");
                    input.type = "text";
                    input.placeholder = filter.placeholder ?? "";
                    control = input;
                }
                control.name = filter.id;
                control.dataset.filterId = filter.id;
                control.value = values[filter.id] ?? "";
                label.append(copy, control);
                return label;
            }),
        );
    }

    private syncConfig(): void {
        this.selectedRow = this.dataset.selected ?? "";
        const widget = parseJson<TableWidget>(this.dataset.configJson ?? "");
        if (!widget || widget.widget !== "w-table") {
            return;
        }
        this.value = {
            title: widget.title ?? widget.source.endpoint,
            actions: (widget.actions ?? []).map((action) => ({
                label: action.label,
                action: action.id,
                widget: widget.id,
                ...(action.selection?.opens ? { target: action.selection.opens } : {}),
                tone: action.tone,
                ...(action.confirm ? { confirm: action.confirm } : {}),
            })),
            columns: widget.columns.map((column) => ({
                key: column.id,
                label: column.label,
                ...(column.width ? { width: column.width } : {}),
                ...(column.primary ? { primary: true } : {}),
            })),
            filters: (widget.filters ?? []).map((filter) => ({
                id: filter.id,
                label: filter.label,
                type: filter.type === "select" ? "select" : "text",
                ...(filter.placeholder ? { placeholder: filter.placeholder } : {}),
                ...(filter.options ? { options: filter.options } : {}),
            })),
            filterValues: parseFilterValues(this.dataset.filtersJson ?? ""),
            rows: [],
        };
    }

    private syncRows(): void {
        const rows = this.rows();
        for (const row of rows) {
            row.toggleAttribute("selected", Boolean(this.selectedRow && row.rowKey === this.selectedRow));
        }
        this.query<HTMLElement>("[data-empty]").hidden = rows.length > 0;
    }

    private rows(): DashboardWRow[] {
        return Array.from(this.querySelectorAll<DashboardWRow>("cms-dashboard-w-row"));
    }

    private onSlotChange = (): void => this.syncRows();

    private onActionClick = (event: Event): void => {
        const action = (event.target as Element | null)?.closest<HTMLElement>("[data-action]");
        if (action?.dataset.confirm && !window.confirm(action.dataset.confirm)) {
            return;
        }
        if (action?.dataset.action) {
            emitWidgetEvent(this, WIDGET_ACTION_EVENT, {
                action: action.dataset.action,
                widget: action.dataset.widget,
                target: action.dataset.target,
            });
        }
    };

    private onSelectAll = (event: Event): void => {
        const checked = Boolean((event.target as HTMLInputElement | null)?.checked);
        for (const row of this.rows()) {
            row.checked = checked;
        }
    };

    private onFilterSubmit = (event: Event): void => {
        event.preventDefault();
        const filters = filterFormValues(event.currentTarget as HTMLFormElement);
        emitWidgetEvent(this, WIDGET_FILTER_CHANGE_EVENT, {
            widget: parseJson<TableWidget>(this.dataset.configJson ?? "")?.id ?? "",
            filters,
        });
    };

    private onFilterClear = (): void => {
        const form = this.query<HTMLFormElement>("[data-filters]");
        for (const control of Array.from(form.elements)) {
            if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement) {
                control.value = "";
            }
        }
        emitWidgetEvent(this, WIDGET_FILTER_CHANGE_EVENT, {
            widget: parseJson<TableWidget>(this.dataset.configJson ?? "")?.id ?? "",
            filters: {},
        });
    };

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector(selector) as T;
    }
}

if (!customElements.get("cms-dashboard-w-table")) {
    customElements.define("cms-dashboard-w-table", DashboardWTable);
}

export type { WTableColumn, WTableData, WTableRow };

type TableWidget = Extract<DashboardWidget, { widget: "w-table" }>;

function parseJson<T>(value: string): T | null {
    if (!value) {
        return null;
    }
    try {
        return JSON.parse(value) as T;
    } catch {
        return null;
    }
}

function parseFilterValues(value: string): Record<string, string> {
    const parsed = parseJson<unknown>(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
    }
    return Object.fromEntries(
        Object.entries(parsed)
            .filter(([, entry]) => typeof entry === "string")
            .map(([key, entry]) => [key, entry as string]),
    );
}

function filterFormValues(form: HTMLFormElement): Record<string, string> {
    const values: Record<string, string> = {};
    for (const control of Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-filter-id]"))) {
        const value = control.value.trim();
        if (value) {
            values[control.dataset.filterId!] = value;
        }
    }
    return values;
}
