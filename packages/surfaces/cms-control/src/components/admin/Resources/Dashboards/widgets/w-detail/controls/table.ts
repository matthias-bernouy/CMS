import { formatDashboardValue } from "../../../domain/formatting";
import { setValueAt, valueAt } from "../../../runtime/expressions";
import { DashboardWReorderableList, type ReorderableListData } from "../../w-reorderable-list/WReorderableList";
import type { WDetailField, WDetailFieldValue } from "../types";
import { createTableEditor, readTableEditor } from "./editors";
import { bindFieldControl } from "./shared";

const tableRowSources = new WeakMap<HTMLElement, Record<string, unknown>>();

export function createTableControl(field: WDetailField): HTMLElement {
    const root = document.createElement("div");
    root.className = "detail-table";
    bindFieldControl(root, field);
    root.dataset.tableEditable = String(field.editable === true);
    const columns = field.columns ?? [];
    root.style.setProperty("--detail-table-columns", tableColumns(columns, field.editable === true));

    const header = document.createElement("div");
    header.className = "detail-table-row detail-table-head";
    for (const column of columns) {
        const cell = document.createElement("span");
        cell.textContent = column.label;
        header.append(cell);
    }
    if (field.editable) {
        header.append(document.createElement("span"));
    }
    root.append(header);

    for (const row of tableRows(field.value)) {
        root.append(tableRow(field, row));
    }
    if (field.editable) {
        const add = document.createElement("button");
        add.type = "button";
        add.className = "detail-table-add";
        add.dataset.tableAdd = "true";
        add.textContent = field.addLabel ?? "Add row";
        root.append(add);
    }
    return root;
}

export function createReorderableListControl(field: WDetailField): HTMLElement {
    const list = document.createElement("cms-dashboard-w-reorderable-list") as DashboardWReorderableList;
    const data: ReorderableListData = {
        items: tableRows(field.value),
        itemKey: field.itemKey ?? "id",
        ...(field.positionPath ? { positionPath: field.positionPath } : {}),
        ...(field.reorderableLayout ? { layout: field.reorderableLayout } : {}),
        fields: (field.reorderableFields ?? []).map((item) => ({ ...item })),
        ...(field.addLabel ? { addLabel: field.addLabel } : {}),
        ...(field.minItems !== undefined ? { minItems: field.minItems } : {}),
        ...(field.maxItems !== undefined ? { maxItems: field.maxItems } : {}),
    };
    list.data = data;
    bindFieldControl(list, field);
    return list;
}

export function tableRow(field: WDetailField, row: Record<string, unknown>): HTMLElement {
    const element = document.createElement("div");
    element.className = "detail-table-row";
    element.dataset.tableRow = "true";
    tableRowSources.set(element, structuredClone(row));
    for (const column of field.columns ?? []) {
        const cell = document.createElement("span");
        if (field.editable && column.editable === true) {
            cell.append(createTableEditor(column, valueAt(row, column.path)));
        } else {
            cell.textContent = tableCellDisplayValue(valueAt(row, column.path), row, column);
        }
        element.append(cell);
    }
    if (field.editable) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "detail-table-remove";
        remove.dataset.tableRemove = "true";
        remove.textContent = "Remove";
        element.append(remove);
    }
    return element;
}

export function readTableValue(field: WDetailField, control: HTMLElement): Record<string, unknown>[] {
    if (!field.editable) {
        return structuredClone(tableRows(field.value));
    }
    return Array.from(control.querySelectorAll<HTMLElement>("[data-table-row]"))
        .map((row) => readTableRow(field, row))
        .filter(hasTableValue);
}

export function isReorderableListControl(control: HTMLElement): control is DashboardWReorderableList {
    return control instanceof DashboardWReorderableList;
}

function readTableRow(field: WDetailField, row: HTMLElement): Record<string, unknown> {
    const value = structuredClone(tableRowSources.get(row) ?? {});
    for (const column of field.columns ?? []) {
        const input = row.querySelector<HTMLElement>(`[data-table-column="${cssEscape(column.key)}"]`);
        if (!input) {
            continue;
        }
        setValueAt(value, column.path, readTableEditor(column, input));
    }
    return value;
}

function tableRows(value: WDetailFieldValue): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter(
        (item): item is Record<string, unknown> => item !== null && typeof item === "object" && !Array.isArray(item),
    );
}

function hasTableValue(value: unknown): boolean {
    if (Array.isArray(value)) {
        return value.some(hasTableValue);
    }
    if (isRecord(value)) {
        return Object.values(value).some(hasTableValue);
    }
    return String(value ?? "").trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function tableCellDisplayValue(
    value: unknown,
    row: Record<string, unknown>,
    column: NonNullable<WDetailField["columns"]>[number],
): string {
    if (column.format === "date" || column.format === "money") {
        return formatDashboardValue(value, column.format, {
            currency: column.format === "money" ? tableCurrency(row, column.path) : undefined,
        });
    }
    return formatDashboardValue(value, column.format);
}

function tableCurrency(row: Record<string, unknown>, valuePath: string): string | undefined {
    const separator = valuePath.lastIndexOf(".");
    const siblingPath = separator === -1 ? "currency" : `${valuePath.slice(0, separator)}.currency`;
    const value = valueAt(row, siblingPath) ?? (siblingPath === "currency" ? undefined : valueAt(row, "currency"));
    const currency = value === null || value === undefined ? "" : String(value).trim();
    return currency || undefined;
}

function tableColumns(columns: WDetailField["columns"], editable: boolean): string {
    return [
        ...(columns ?? []).map((column) => column.width ?? "minmax(8rem, 1fr)"),
        ...(editable ? ["72px"] : []),
    ].join(" ");
}

function cssEscape(value: string): string {
    return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/"/g, '\\"');
}
