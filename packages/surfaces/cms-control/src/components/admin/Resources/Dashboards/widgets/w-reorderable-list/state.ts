import { setValueAt, valueAt } from "../../runtime/expressions";

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

export function emptyData(): ReorderableListData {
    return { items: [], itemKey: "id", fields: [] };
}

export function normalizeData(value: ReorderableListData): ReorderableListData {
    const clone = structuredClone(value);
    return {
        ...clone,
        items: Array.isArray(clone.items) ? clone.items.filter(isRecord) : [],
        fields: Array.isArray(clone.fields) ? clone.fields : [],
    };
}

export function cloneData(value: ReorderableListData): ReorderableListData {
    return structuredClone(value);
}

export function cloneItems(value: ReorderableListData): ReorderableListItem[] {
    return structuredClone(value.items);
}

export function addItem(value: ReorderableListData): boolean {
    if (value.maxItems !== undefined && value.items.length >= value.maxItems) return false;
    value.items.push({});
    return true;
}

export function removeItem(value: ReorderableListData, index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= value.items.length) return false;
    if (value.minItems !== undefined && value.items.length <= value.minItems) return false;
    value.items.splice(index, 1);
    return true;
}

export function moveItem(value: ReorderableListData, from: number, to: number): boolean {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return false;
    if (from < 0 || from >= value.items.length || to < 0 || to >= value.items.length) return false;
    const [item] = value.items.splice(from, 1);
    if (!item) return false;
    value.items.splice(to, 0, item);
    return true;
}

export function updateItem(
    value: ReorderableListData,
    index: number,
    path: string,
    fieldValue: unknown,
): boolean {
    const item = value.items[index];
    return Boolean(item && setValueAt(item, path, fieldValue));
}

export function persistPositions(value: ReorderableListData): void {
    const positionPath = value.positionPath ?? "position";
    value.items.forEach((item, index) => setValueAt(item, positionPath, index));
}

export function itemTextAt(item: ReorderableListItem, path: string): string {
    const resolved = valueAt(item, path);
    return resolved === null || resolved === undefined ? "" : String(resolved);
}

export function itemKeyAt(item: ReorderableListItem, path: string, fallback: number): string {
    return String(valueAt(item, path) ?? fallback);
}

function isRecord(value: unknown): value is ReorderableListItem {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
