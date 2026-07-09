import type { Source } from "../interfaces/Source";
import {
    SOURCE_OVERLAY_FIELD_TYPES,
    type SourceOverlay,
    type SourceOverlayField,
    type SourceOverlayFieldSourceMap,
    type SourceOverlayFieldType,
} from "../interfaces/SourceOverlay";
import { executeEndpoint, type ExecutorDeps } from "./executeEndpoint";
import { parseUrn } from "./urn";

const SIMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
type BoolFieldKey = "required" | "selfEditable" | "adminEditable" | "showInDashboardTable" | "exposeToEditorSources";

export async function materializeSourceOverlays(
    source: Source,
    overlays: readonly SourceOverlay[],
    deps?: ExecutorDeps,
): Promise<SourceOverlay[]> {
    return Promise.all(overlays.map(overlay => materializeSourceOverlay(source, overlay, deps)));
}

export async function materializeSourceOverlay(
    source: Source,
    overlay: SourceOverlay,
    deps?: ExecutorDeps,
): Promise<SourceOverlay> {
    if (!overlay.fieldSource) return structuredClone(overlay);

    const endpoint = source.endpoints.find(candidate =>
        parseUrn(candidate.urn)?.endpoint === overlay.fieldSource?.endpointId);
    if (!endpoint) return { ...structuredClone(overlay), fields: [] };

    const request = new Request("http://cms.local/source-overlay-fields", {
        method: endpoint.method,
        headers: { accept: "application/json" },
    });
    const response = await executeEndpoint(endpoint, request, deps);
    if (!response.ok) return { ...structuredClone(overlay), fields: [] };

    const body = await response.json().catch(() => null);
    return {
        ...structuredClone(overlay),
        fields: fieldsFromBody(body, overlay.fieldSource.path ?? "fields", overlay.fieldSource.map),
    };
}

function fieldsFromBody(body: unknown, path: string, map?: SourceOverlayFieldSourceMap): SourceOverlayField[] {
    const value = valueAt(body, path);
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const fields: SourceOverlayField[] = [];
    for (const entry of value) {
        const field = fieldFromEntry(entry, map);
        if (!field || seen.has(field.id)) continue;
        seen.add(field.id);
        fields.push(field);
    }
    return fields;
}

function fieldFromEntry(entry: unknown, map: SourceOverlayFieldSourceMap = {}): SourceOverlayField | null {
    if (!isRecord(entry)) return null;
    const id = text(valueAt(entry, map.id ?? "id"));
    const type = fieldType(valueAt(entry, map.type ?? "type"));
    if (!id || !SIMPLE_ID.test(id) || !type) return null;
    return {
        id,
        label: text(valueAt(entry, map.label ?? "label")) || id,
        type,
        ...optionalText(entry, map.path ?? "path", "path"),
        ...optionalText(entry, map.section ?? "section", "section"),
        ...optionalBool(entry, map.required ?? "required", "required"),
        ...optionalBool(entry, map.selfEditable ?? "selfEditable", "selfEditable"),
        ...optionalBool(entry, map.adminEditable ?? "adminEditable", "adminEditable"),
        ...optionalBool(entry, map.showInDashboardTable ?? "showInDashboardTable", "showInDashboardTable"),
        ...optionalBool(entry, map.exposeToEditorSources ?? "exposeToEditorSources", "exposeToEditorSources"),
    };
}

function valueAt(value: unknown, path: string): unknown {
    if (!path) return value;
    let current = value;
    for (const part of path.split(".").filter(Boolean)) {
        if (!isRecord(current)) return undefined;
        current = current[part];
    }
    return current;
}

function fieldType(value: unknown): SourceOverlayFieldType | null {
    return (SOURCE_OVERLAY_FIELD_TYPES as readonly unknown[]).includes(value)
        ? value as SourceOverlayFieldType
        : null;
}

function optionalText(entry: Record<string, unknown>, path: string, key: "path" | "section"): Pick<SourceOverlayField, typeof key> {
    const value = text(valueAt(entry, path));
    return value ? { [key]: value } as Pick<SourceOverlayField, typeof key> : {};
}

function optionalBool(entry: Record<string, unknown>, path: string, key: BoolFieldKey): Partial<SourceOverlayField> {
    const value = valueAt(entry, path);
    return typeof value === "boolean" ? { [key]: value } : {};
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
