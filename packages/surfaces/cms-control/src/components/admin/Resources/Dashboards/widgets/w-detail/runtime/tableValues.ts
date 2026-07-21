import { valueAt } from "../../../runtime/expressions";
import { readFieldControlValue, tableRow } from "../controls";
import type { WDetailField } from "../types";
import { DetailFieldState } from "./fieldState";

type EmitFieldChange = (control: HTMLElement) => void;

export function toggleChip(chip: HTMLButtonElement, emitFieldChange: EmitFieldChange): void {
    chip.setAttribute("aria-pressed", String(chip.getAttribute("aria-pressed") !== "true"));
    const control = chip.closest<HTMLElement>("[data-field-control]");
    if (control) {
        emitFieldChange(control);
    }
}

export function addTableRow(
    button: HTMLButtonElement,
    fields: DetailFieldState,
    emitFieldChange: EmitFieldChange,
): void {
    const control = button.closest<HTMLElement>("[data-field-control]");
    const field = control ? fields.find(control.dataset.fieldControl ?? "") : undefined;
    if (!control || !field || field.input !== "table") {
        return;
    }
    control.insertBefore(tableRow(field, {}), button);
    emitFieldChange(control);
    updateDerivedTables(field.id, fields);
}

export function removeTableRow(
    button: HTMLButtonElement,
    fields: DetailFieldState,
    emitFieldChange: EmitFieldChange,
): void {
    const control = button.closest<HTMLElement>("[data-field-control]");
    const row = button.closest("[data-table-row]");
    if (!control || !row) {
        return;
    }
    row.remove();
    emitFieldChange(control);
    updateDerivedTables(control.dataset.fieldControl ?? "", fields);
}

export function updateDerivedTables(sourceFieldId: string, fields: DetailFieldState): void {
    const sourceControl = fields.control(sourceFieldId);
    const sourceField = sourceControl ? fields.find(sourceFieldId) : undefined;
    if (!sourceControl || !sourceField) {
        return;
    }
    const sourceValue = readFieldControlValue(sourceField, sourceControl);
    for (const field of fields.fields()) {
        if (field.input !== "table" || field.derive?.sourceField !== sourceFieldId) {
            continue;
        }
        const control = fields.control(field.id);
        if (!control) {
            continue;
        }
        const rows = deriveTableRows(field, sourceValue);
        field.value = rows;
        replaceTableRows(control, field, rows);
    }
}

function replaceTableRows(control: HTMLElement, field: WDetailField, rows: Record<string, unknown>[]): void {
    control.querySelectorAll("[data-table-row]").forEach((row) => row.remove());
    const anchor = control.querySelector("[data-table-add]");
    for (const row of rows) {
        control.insertBefore(tableRow(field, row), anchor);
    }
}

function deriveTableRows(field: WDetailField, sourceValue: unknown): Record<string, unknown>[] {
    if (field.derive?.type !== "cartesian") {
        return [];
    }
    const axes = Array.isArray(sourceValue)
        ? sourceValue
              .filter(
                  (row): row is Record<string, unknown> =>
                      row !== null && typeof row === "object" && !Array.isArray(row),
              )
              .map((row, index) => ({
                  label: textValue(valueAt(row, field.derive!.labelPath)),
                  values: listValue(valueAt(row, field.derive!.valuesPath)),
                  position: index,
              }))
              .filter((axis) => axis.label && axis.values.length)
        : [];
    if (!axes.length) {
        return [];
    }
    return axes
        .reduce<Array<Array<{ label: string; value: string }>>>(
            (sets, axis) => sets.flatMap((set) => axis.values.map((value) => [...set, { label: axis.label, value }])),
            [[]],
        )
        .map((choices, index) => ({
            key: choices.map((choice) => `${slug(choice.label)}:${slug(choice.value)}`).join("|"),
            options: choices.map((choice) => choice.value).join(" / "),
            title: choices.map((choice) => `${choice.label}: ${choice.value}`).join(" / "),
            status: "inactive",
            position: index,
        }));
}

function listValue(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === "string") {
        return value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
    }
    return [];
}

function textValue(value: unknown): string {
    return value === null || value === undefined ? "" : String(value).trim();
}

function slug(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}
