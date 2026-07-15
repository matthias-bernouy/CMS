import { setValueAt, valueAt } from "../../../runtime/expressions";
import {
    DashboardWReorderableList,
    type ReorderableListData,
} from "../../w-reorderable-list/WReorderableList";
import type { WDetailField, WDetailFieldValue } from "../types";
import { bindFieldControl, type ValueControl } from "./shared";

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
    if (field.editable) header.append(document.createElement("span"));
    root.append(header);

    for (const row of tableRows(field.value)) root.append(tableRow(field, row));
    if (field.editable) {
        const add = document.createElement("button");
        add.type = "button";
        add.className = "detail-table-add";
        add.dataset.tableAdd = "true";
        add.textContent = "Add row";
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
        fields: (field.reorderableFields ?? []).map(item => ({ ...item })),
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
        if (field.editable && column.editable) {
            const input = document.createElement("p9r-input") as ValueControl;
            const value = tableCellInputValue(valueAt(row, column.path), column.value);
            input.setAttribute("value", value);
            input.value = value;
            input.dataset.tableColumn = column.key;
            cell.append(input);
        } else {
            cell.textContent = tableCellDisplayValue(valueAt(row, column.path));
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
    if (!field.editable) return structuredClone(tableRows(field.value));
    return Array.from(control.querySelectorAll<HTMLElement>("[data-table-row]"))
        .map(row => readTableRow(field, row))
        .filter(hasTableValue);
}

export function isReorderableListControl(control: HTMLElement): control is DashboardWReorderableList {
    return control instanceof DashboardWReorderableList;
}

function readTableRow(field: WDetailField, row: HTMLElement): Record<string, unknown> {
    const value = structuredClone(tableRowSources.get(row) ?? {});
    for (const column of field.columns ?? []) {
        const input = row.querySelector<ValueControl>(`[data-table-column="${cssEscape(column.key)}"]`);
        if (!input) continue;
        setValueAt(value, column.path, column.value === "list" ? listValue(input.value) : input.value);
    }
    return value;
}

function tableRows(value: WDetailFieldValue): Record<string, unknown>[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Record<string, unknown> => (
        item !== null && typeof item === "object" && !Array.isArray(item)
    ));
}

function hasTableValue(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(hasTableValue);
    if (isRecord(value)) return Object.values(value).some(hasTableValue);
    return String(value ?? "").trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function tableCellInputValue(value: unknown, kind: "text" | "list" | undefined): string {
    if (kind === "list" && Array.isArray(value)) return value.map(item => String(item)).join(", ");
    return value === null || value === undefined ? "" : String(value);
}

function tableCellDisplayValue(value: unknown): string {
    if (Array.isArray(value)) return value.map(item => String(item)).join(", ");
    return value === null || value === undefined ? "" : String(value);
}

function listValue(value: string): string[] {
    return value.split(",").map(item => item.trim()).filter(Boolean);
}

function tableColumns(columns: WDetailField["columns"], editable: boolean): string {
    return [
        ...(columns ?? []).map(column => column.width ?? "minmax(8rem, 1fr)"),
        ...(editable ? ["72px"] : []),
    ].join(" ");
}

function cssEscape(value: string): string {
    return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/"/g, "\\\"");
}
