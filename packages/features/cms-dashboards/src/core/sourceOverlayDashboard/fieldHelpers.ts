import {
    sourceOverlayFieldPath,
    type SourceOverlayEditableScope,
    type SourceOverlayField,
} from "@bernouy/cms-sources";
import type { DashboardField } from "../../interfaces/Dashboard";

export function dashboardField(
    field: SourceOverlayField,
    options: { pathPrefix?: string; readonly?: boolean } = {},
): DashboardField {
    const pathPrefix = normalizedTargetPath(options.pathPrefix);
    const base = {
        id: overlayFieldId(field, pathPrefix),
        label: field.label,
        path: joinedPath(pathPrefix, sourceOverlayFieldPath(field)),
        ...(field.required ? { required: true } : {}),
    };
    if (options.readonly) return { ...base, type: "readonly" };
    if (field.type === "boolean" && !field.multiple) return { ...base, type: "checkbox" };
    if (field.type === "number" && !field.multiple) return { ...base, type: "number" };
    if (field.multiple) {
        return field.options === undefined
            ? { ...base, type: "tokens" }
            : { ...base, type: "tokens", options: field.options.map(option => ({ ...option })) };
    }
    return field.options === undefined
        ? { ...base, type: "text" }
        : { ...base, type: "select", options: field.options.map(option => ({ ...option })) };
}

export function overlayFieldId(field: SourceOverlayField, pathPrefix = ""): string {
    const raw = joinedPath(normalizedTargetPath(pathPrefix), field.id);
    const normalized = raw.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^[-_]+/, "");
    return normalized || "field";
}

export function normalizedTargetPath(path: string | undefined): string {
    return (path ?? "").split(".")
        .map(part => part.trim().replace(/\[\]$/, ""))
        .filter(Boolean)
        .join(".");
}

export function joinedPath(prefix: string, path: string): string {
    return [prefix, path].filter(Boolean).join(".");
}

export function editableFields(
    fields: readonly SourceOverlayField[],
    editable: SourceOverlayEditableScope | undefined,
): SourceOverlayField[] {
    if (editable === "self") return fields.filter(field => field.selfEditable !== false);
    if (editable === "admin") return fields.filter(field => field.adminEditable !== false);
    return fields.filter(field => field.selfEditable !== false || field.adminEditable !== false);
}
