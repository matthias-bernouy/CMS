import type { Source } from "../interfaces/Source";
import {
    SOURCE_OVERLAY_FIELD_TYPES,
    type SourceOverlay,
    type SourceOverlayDashboardOption,
    type SourceOverlayField,
    type SourceOverlayFieldSourceMap,
    type SourceOverlayFieldType,
} from "../interfaces/SourceOverlay";
import { executeEndpoint, type ExecutorDeps } from "./executeEndpoint";
import { dataValueAtPath } from "./parseDataShape";
import type { SourceOverlaySchemaCache } from "./SourceOverlaySchemaCache";
import { parseUrn } from "./urn";

const SIMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
type BoolFieldKey =
    | "required"
    | "multiple"
    | "selfEditable"
    | "adminEditable"
    | "showInDashboardTable"
    | "exposeToEditorSources";

export async function materializeSourceOverlays(
    source: Source,
    overlays: readonly SourceOverlay[],
    deps?: ExecutorDeps,
    cache?: SourceOverlaySchemaCache,
): Promise<SourceOverlay[]> {
    return Promise.all(overlays.map((overlay) => materializeSourceOverlay(source, overlay, deps, cache)));
}

export async function materializeSourceOverlay(
    source: Source,
    overlay: SourceOverlay,
    deps?: ExecutorDeps,
    cache?: SourceOverlaySchemaCache,
): Promise<SourceOverlay> {
    if (!overlay.fieldSource) {
        return structuredClone(overlay);
    }

    const load = () => loadSourceOverlayFields(source, overlay, deps);
    const fields = cache ? await cache.getOrLoad(source, overlay, load) : await load();
    return { ...structuredClone(overlay), fields: fields ?? [] };
}

async function loadSourceOverlayFields(
    source: Source,
    overlay: SourceOverlay,
    deps?: ExecutorDeps,
): Promise<SourceOverlayField[] | null> {
    const fieldSource = overlay.fieldSource;
    if (!fieldSource) {
        return null;
    }
    const endpoint = source.endpoints.find((candidate) => parseUrn(candidate.urn)?.endpoint === fieldSource.endpointId);
    if (!endpoint) {
        return null;
    }

    const requestUrl = new URL("http://cms.local/source-overlay-fields");
    for (const [name, value] of Object.entries(fieldSource.params ?? {})) {
        requestUrl.searchParams.set(name, value);
    }
    const request = new Request(requestUrl, {
        method: endpoint.method,
        headers: { accept: "application/json" },
    });
    const response = await executeEndpoint(endpoint, request, deps);
    if (!response.ok) {
        return null;
    }

    const body = await response.json().catch(() => null);
    return fieldsFromBody(body, fieldSource.path ?? "fields", fieldSource.map);
}

function fieldsFromBody(body: unknown, path: string, map?: SourceOverlayFieldSourceMap): SourceOverlayField[] | null {
    const value = dataValueAtPath(body, path);
    if (!Array.isArray(value)) {
        return null;
    }
    const seen = new Set<string>();
    const fields: SourceOverlayField[] = [];
    for (const entry of value) {
        const field = fieldFromEntry(entry, map);
        if (!field || seen.has(field.id)) {
            continue;
        }
        seen.add(field.id);
        fields.push(field);
    }
    return fields;
}

function fieldFromEntry(entry: unknown, map: SourceOverlayFieldSourceMap = {}): SourceOverlayField | null {
    if (!isRecord(entry)) {
        return null;
    }
    const id = text(dataValueAtPath(entry, map.id ?? "id"));
    const type = fieldType(dataValueAtPath(entry, map.type ?? "type"));
    if (!id || !SIMPLE_ID.test(id) || !type) {
        return null;
    }
    return {
        id,
        label: text(dataValueAtPath(entry, map.label ?? "label")) || id,
        type,
        ...optionalText(entry, map.path ?? "path", "path"),
        ...optionalText(entry, map.section ?? "section", "section"),
        ...optionalBool(entry, map.required ?? "required", "required"),
        ...optionalBool(entry, map.multiple ?? "multiple", "multiple"),
        ...optionalBool(entry, map.selfEditable ?? "selfEditable", "selfEditable"),
        ...optionalBool(entry, map.adminEditable ?? "adminEditable", "adminEditable"),
        ...optionalBool(entry, map.showInDashboardTable ?? "showInDashboardTable", "showInDashboardTable"),
        ...optionalBool(entry, map.exposeToEditorSources ?? "exposeToEditorSources", "exposeToEditorSources"),
        ...optionalOptions(entry, map.options ?? "options"),
    };
}

function fieldType(value: unknown): SourceOverlayFieldType | null {
    return (SOURCE_OVERLAY_FIELD_TYPES as readonly unknown[]).includes(value)
        ? (value as SourceOverlayFieldType)
        : null;
}

function optionalText(
    entry: Record<string, unknown>,
    path: string,
    key: "path" | "section",
): Pick<SourceOverlayField, typeof key> {
    const value = text(dataValueAtPath(entry, path));
    return value ? ({ [key]: value } as Pick<SourceOverlayField, typeof key>) : {};
}

function optionalBool(entry: Record<string, unknown>, path: string, key: BoolFieldKey): Partial<SourceOverlayField> {
    const value = dataValueAtPath(entry, path);
    return typeof value === "boolean" ? { [key]: value } : {};
}

function optionalOptions(
    entry: Record<string, unknown>,
    path: string,
): Pick<SourceOverlayField, "options"> | Record<never, never> {
    const value = dataValueAtPath(entry, path);
    if (!Array.isArray(value)) {
        return {};
    }
    return { options: value.map(option).filter((item): item is SourceOverlayDashboardOption => item !== null) };
}

function option(value: unknown): SourceOverlayDashboardOption | null {
    if (!isRecord(value)) {
        return null;
    }
    const optionValue = text(value.value);
    const label = text(value.label);
    if (!optionValue || !label) {
        return null;
    }
    return {
        value: optionValue,
        label,
        ...optionalOptionText(value.subtitle, "subtitle"),
        ...optionalOptionText(value.media, "media"),
    };
}

function optionalOptionText(
    value: unknown,
    key: "subtitle" | "media",
): Pick<SourceOverlayDashboardOption, typeof key> | Record<never, never> {
    const parsed = text(value);
    return parsed ? ({ [key]: parsed } as Pick<SourceOverlayDashboardOption, typeof key>) : {};
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
