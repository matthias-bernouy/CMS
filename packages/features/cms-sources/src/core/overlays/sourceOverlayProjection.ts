import type { DataShape } from "cms-sources/interfaces/DataShape";
import type { Source, SourceEndpoint } from "cms-sources/interfaces/Source";
import {
    sourceOverlayFieldShape,
    type SourceOverlay,
    type SourceOverlayEditableScope,
    type SourceOverlayEndpointTarget,
    type SourceOverlayField,
} from "cms-sources/interfaces/SourceOverlay";
import { parseUrn } from "cms-sources/core/system/urn";

const DEFAULT_EXTRA_FIELD_ROOT = "metadata";

export function applySourceOverlays(source: Source, overlays: readonly SourceOverlay[]): Source {
    const relevant = overlaysFor(source, overlays).filter((overlay) => overlay.fields.length);
    if (!relevant.length) {
        return structuredClone(source);
    }

    const next = structuredClone(source);
    for (const overlay of relevant) {
        for (const endpoint of next.endpoints) {
            applyEndpointOverlay(endpoint, overlay);
        }
    }
    return next;
}

export function overlaysFor(source: Source, overlays: readonly SourceOverlay[]): SourceOverlay[] {
    const sourceId = parseUrn(source.urn)?.source ?? "";
    return sourceId ? overlays.filter((overlay) => overlay.sourceId === sourceId) : [];
}

export function sourceOverlayFieldPath(field: SourceOverlayField): string {
    return field.path?.trim() || `${DEFAULT_EXTRA_FIELD_ROOT}.${field.id}`;
}

function applyEndpointOverlay(endpoint: SourceEndpoint, overlay: SourceOverlay): void {
    const endpointId = parseUrn(endpoint.urn)?.endpoint ?? "";
    for (const target of overlay.input ?? []) {
        if (target.endpointId !== endpointId) {
            continue;
        }
        const fields = editableFields(overlay.fields, target.editable);
        if (!fields.length) {
            continue;
        }
        endpoint.input ??= {};
        endpoint.input.body = withExtraFieldsShape(endpoint.input.body ?? { type: "object" }, target, fields);
    }

    for (const target of overlay.output ?? []) {
        if (target.endpointId !== endpointId) {
            continue;
        }
        const fields = overlay.fields.filter((field) => field.exposeToEditorSources !== false);
        if (!fields.length) {
            continue;
        }
        for (const response of endpoint.output ?? []) {
            if (response.body) {
                response.body = withExtraFieldsShape(response.body, target, fields);
            }
        }
    }
}

function withExtraFieldsShape(
    shape: DataShape,
    target: SourceOverlayEndpointTarget,
    fields: readonly SourceOverlayField[],
): DataShape {
    const next = structuredClone(shape);
    const objectShape = objectShapeAt(next, target.path ?? "");
    if (objectShape) {
        attachExtraFields(objectShape, fields);
    }
    return next;
}

function objectShapeAt(shape: DataShape, path: string): DataShape | null {
    let current: DataShape | undefined = shape;
    for (const part of path
        .split(".")
        .map((part) => part.trim())
        .filter(Boolean)) {
        if (!current) {
            return null;
        }
        if (part.endsWith("[]")) {
            if (current.type !== "object") {
                return null;
            }
            current = current.properties?.[part.slice(0, -2)];
            if (current?.type !== "array") {
                return null;
            }
            current = current.items;
            continue;
        }
        if (current.type !== "object") {
            return null;
        }
        current = current.properties?.[part];
    }
    return current?.type === "object" ? current : null;
}

function attachExtraFields(shape: DataShape, fields: readonly SourceOverlayField[]): void {
    if (shape.type !== "object") {
        return;
    }
    const createdIntermediateObjects = new Set<DataShape>();
    for (const field of fields) {
        attachExtraField(shape, sourceOverlayFieldPath(field), field, createdIntermediateObjects);
    }
}

function attachExtraField(
    shape: DataShape,
    path: string,
    field: SourceOverlayField,
    createdIntermediateObjects: Set<DataShape>,
): void {
    const parts = path
        .split(".")
        .map((part) => part.trim())
        .filter(Boolean);
    if (!parts.length || shape.type !== "object") {
        return;
    }

    let current = shape;
    for (const part of parts.slice(0, -1)) {
        current.properties ??= {};
        const existing = current.properties[part];
        if (!existing || existing.type !== "object") {
            const intermediate: DataShape = {
                type: "object",
                properties: {},
                ...(field.nullable === true ? { nullable: true } : {}),
            };
            current.properties[part] = intermediate;
            createdIntermediateObjects.add(intermediate);
        } else if (field.nullable === true && createdIntermediateObjects.has(existing)) {
            existing.nullable = true;
        }
        current = current.properties[part]!;
    }

    const leaf = parts[parts.length - 1]!;
    current.properties ??= {};
    current.properties[leaf] = {
        ...current.properties[leaf],
        ...sourceOverlayFieldShape(field),
    };
    const required = new Set(current.required ?? []);
    if (field.required) {
        required.add(leaf);
    } else {
        required.delete(leaf);
    }
    current.required = [...required];
    if (!current.required.length) {
        delete current.required;
    }
}

function editableFields(
    fields: readonly SourceOverlayField[],
    editable: SourceOverlayEditableScope | undefined,
): SourceOverlayField[] {
    if (editable === "self") {
        return fields.filter((field) => field.selfEditable !== false);
    }
    if (editable === "admin") {
        return fields.filter((field) => field.adminEditable !== false);
    }
    return fields.filter((field) => field.selfEditable !== false || field.adminEditable !== false);
}
