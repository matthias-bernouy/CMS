import {
    sourceOverlayFieldPath,
    type SourceOverlayEditableScope,
    type SourceOverlayField,
} from "@bernouy/cms-sources";
import type { DashboardField } from "../../interfaces/Dashboard";

export function dashboardField(field: SourceOverlayField): DashboardField {
    return {
        id: overlayFieldId(field),
        label: field.label,
        path: sourceOverlayFieldPath(field),
        type: field.type === "number" ? "number" : field.type === "boolean" ? "checkbox" : "text",
        ...(field.required ? { required: true } : {}),
    };
}

export function overlayFieldId(field: SourceOverlayField): string {
    const normalized = field.id.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^[-_]+/, "");
    return normalized || "field";
}

export function editableFields(
    fields: readonly SourceOverlayField[],
    editable: SourceOverlayEditableScope | undefined,
): SourceOverlayField[] {
    if (editable === "self") return fields.filter(field => field.selfEditable !== false);
    if (editable === "admin") return fields.filter(field => field.adminEditable !== false);
    return fields.filter(field => field.selfEditable !== false || field.adminEditable !== false);
}
