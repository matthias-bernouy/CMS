import type { WDetailField, WDetailFieldValue } from "../types";
import { isMediaControl, mediaList } from "../mediaControl";
import { createBasicControl, fieldUsesBasicInternalLabel, readBasicControlValue } from "./basic";
import { createSchemaControl, readSchemaControlValue } from "./schema";
import {
    createReorderableListControl,
    createTableControl,
    isReorderableListControl,
    readTableValue,
    tableRow,
} from "./table";

export function createFieldControl(field: WDetailField): HTMLElement {
    if (field.input === "media-list") return mediaList(field);
    if (field.input === "table") return createTableControl(field);
    if (field.input === "reorderable-list") return createReorderableListControl(field);
    if (field.input === "schema") return createSchemaControl(field);
    return createBasicControl(field);
}

export function fieldUsesInternalLabel(field: WDetailField): boolean {
    return field.input === "media-list" || field.input === "reorderable-list" || field.input === "schema"
        || fieldUsesBasicInternalLabel(field);
}

export function readFieldControlValue(field: WDetailField, control: HTMLElement): WDetailFieldValue {
    if (field.input === "media-list" && isMediaControl(control)) return control.items;
    if (field.input === "table") return readTableValue(field, control);
    if (field.input === "reorderable-list" && isReorderableListControl(control)) return control.items;
    if (field.input === "schema") return readSchemaControlValue(field, control);
    return readBasicControlValue(field, control);
}

export { tableRow };
