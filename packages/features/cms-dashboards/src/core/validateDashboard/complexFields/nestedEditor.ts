import type { Source } from "@bernouy/cms-sources";
import type { DashboardDto, DashboardEmbeddedLookupRef, DashboardOption } from "cms-dashboards/interfaces/Dashboard";
import { validateEmbeddedLookupRef } from "../endpointRefs";
import { isRecord, validateOptions } from "../shared";

export function validateNestedEditor(
    editor: {
        type?: string;
        options?: DashboardOption[];
        lookup?: DashboardEmbeddedLookupRef;
    },
    path: string,
    allowedTypes: readonly string[],
    dashboard: DashboardDto,
    source: Source | null,
    errors: string[],
): void {
    const type = editor.type ?? "text";
    if (isRecord(editor) && Object.hasOwn(editor, "allowCustom")) {
        errors.push(`${path}.allowCustom is not supported for nested editors`);
    }
    if (!allowedTypes.includes(type)) {
        errors.push(`${path}.type is not supported`);
        return;
    }
    if (type === "select" && editor.options === undefined) {
        errors.push(`${path}.options is required`);
    }
    if (type === "combobox" && !editor.options?.length && !editor.lookup) {
        errors.push(`${path} must declare options or lookup`);
    }
    if (editor.options !== undefined) {
        if (type !== "select" && type !== "combobox") {
            errors.push(`${path}.options is not supported for ${type} editors`);
        } else {
            validateOptions(editor.options, `${path}.options`, errors);
        }
    }
    if (editor.lookup === undefined) {
        return;
    }
    if (type !== "combobox") {
        errors.push(`${path}.lookup is only supported for combobox editors`);
        return;
    }
    validateEmbeddedLookupRef(dashboard, editor.lookup, `${path}.lookup`, source, errors);
    if (isRecord(editor.lookup) && Object.hasOwn(editor.lookup, "create")) {
        errors.push(`${path}.lookup.create is not supported`);
    }
    if (isRecord(editor.lookup) && Object.hasOwn(editor.lookup, "descriptionPaths")) {
        errors.push(`${path}.lookup.descriptionPaths is not supported`);
    }
}
