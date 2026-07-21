import {
    SOURCE_OVERLAY_EDITABLE_SCOPES,
    SOURCE_OVERLAY_FIELD_TYPES,
    type SourceOverlay,
    type SourceOverlayEditableScope,
    type SourceOverlayEndpointTarget,
    type SourceOverlayField,
    type SourceOverlayFieldSource,
    type SourceOverlayFieldSourceMap,
    type SourceOverlayFieldType,
    type SourceOverlaySection,
} from "@bernouy/cms-sources";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import MissingParam from "cms-control/errors/Http/MissingParam";
import { parseSourceOverlayOptions } from "./parseSourceOverlayOptions";

const SIMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SAFE_PATH = /^[A-Za-z_$][\w$]*(\[\])?(\.[A-Za-z_$][\w$]*(\[\])?)*$/;
const FIELD_PATH = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;

export function parseSourceOverlayDto(body: Record<string, unknown>): SourceOverlay {
    const overlay: SourceOverlay = {
        id: requiredId(body.id, "id"),
        sourceId: requiredId(body.sourceId, "sourceId"),
        ...(body.label !== undefined ? { label: requiredText(body.label, "label") } : {}),
        ...(body.fieldSource !== undefined ? { fieldSource: parseFieldSource(body.fieldSource) } : {}),
        ...(body.sections !== undefined ? { sections: parseSections(body.sections) } : {}),
        fields: parseFields(body.fields),
    };
    if (body.input !== undefined) {
        overlay.input = parseTargets(body.input, "input");
    }
    if (body.output !== undefined) {
        overlay.output = parseTargets(body.output, "output");
    }
    if (!overlay.input?.length && !overlay.output?.length) {
        throw new InvalidParam("input", "input or output targets are required.");
    }
    return overlay;
}

function parseFieldSource(value: unknown): SourceOverlayFieldSource {
    if (!isRecord(value)) {
        throw new InvalidParam("fieldSource", "must be an object.");
    }
    return {
        endpointId: requiredId(value.endpointId, "fieldSource.endpointId"),
        ...(value.params !== undefined ? { params: parseStringParams(value.params, "fieldSource.params") } : {}),
        ...(value.path !== undefined ? { path: targetPath(value.path, "fieldSource.path") } : {}),
        ...(value.map !== undefined ? { map: parseFieldSourceMap(value.map) } : {}),
    };
}

function parseStringParams(value: unknown, name: string): Record<string, string> {
    if (!isRecord(value)) {
        throw new InvalidParam(name, "must be an object.");
    }
    return Object.fromEntries(
        Object.entries(value).map(([key, raw]) => {
            if (!SIMPLE_ID.test(key)) {
                throw new InvalidParam(`${name}.${key}`, "must use a simple parameter name.");
            }
            if (typeof raw !== "string") {
                throw new InvalidParam(`${name}.${key}`, "must be a string.");
            }
            return [key, raw];
        }),
    );
}

function parseFieldSourceMap(value: unknown): SourceOverlayFieldSourceMap {
    if (!isRecord(value)) {
        throw new InvalidParam("fieldSource.map", "must be an object.");
    }
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, path]) => path !== undefined)
            .map(([key, path]) => [key, fieldPath(path, `fieldSource.map.${key}`)]),
    ) as SourceOverlayFieldSourceMap;
}

function parseFields(value: unknown): SourceOverlayField[] {
    if (!Array.isArray(value)) {
        throw new InvalidParam("fields", "must be an array.");
    }
    const seen = new Set<string>();
    return value.map((entry, index) => {
        if (!isRecord(entry)) {
            throw new InvalidParam(`fields.${index}`, "must be an object.");
        }
        const id = requiredId(entry.id, `fields.${index}.id`);
        if (seen.has(id)) {
            throw new InvalidParam(`fields.${index}.id`, "duplicate field id.");
        }
        seen.add(id);
        return {
            id,
            label: requiredText(entry.label, `fields.${index}.label`),
            type: fieldType(entry.type, `fields.${index}.type`),
            ...(entry.path !== undefined ? { path: fieldPath(entry.path, `fields.${index}.path`) } : {}),
            ...(entry.section !== undefined ? { section: requiredId(entry.section, `fields.${index}.section`) } : {}),
            ...(entry.required === true ? { required: true } : {}),
            ...(entry.selfEditable === false ? { selfEditable: false } : {}),
            ...(entry.adminEditable === false ? { adminEditable: false } : {}),
            ...(entry.showInDashboardTable === true ? { showInDashboardTable: true } : {}),
            ...(entry.exposeToEditorSources === false ? { exposeToEditorSources: false } : {}),
            ...(entry.options !== undefined
                ? { options: parseSourceOverlayOptions(entry.options, `fields.${index}.options`) }
                : {}),
        };
    });
}

function parseSections(value: unknown): SourceOverlaySection[] {
    if (!Array.isArray(value)) {
        throw new InvalidParam("sections", "must be an array.");
    }
    const seen = new Set<string>();
    return value.map((entry, index) => {
        if (!isRecord(entry)) {
            throw new InvalidParam(`sections.${index}`, "must be an object.");
        }
        const id = requiredId(entry.id, `sections.${index}.id`);
        if (seen.has(id)) {
            throw new InvalidParam(`sections.${index}.id`, "duplicate section id.");
        }
        seen.add(id);
        return {
            id,
            label: requiredText(entry.label, `sections.${index}.label`),
            ...(entry.description !== undefined
                ? { description: requiredText(entry.description, `sections.${index}.description`) }
                : {}),
        };
    });
}

function parseTargets(value: unknown, name: string): SourceOverlayEndpointTarget[] {
    if (!Array.isArray(value)) {
        throw new InvalidParam(name, "must be an array.");
    }
    return value.map((entry, index) => {
        if (!isRecord(entry)) {
            throw new InvalidParam(`${name}.${index}`, "must be an object.");
        }
        return {
            endpointId: requiredId(entry.endpointId, `${name}.${index}.endpointId`),
            ...(entry.path !== undefined ? { path: targetPath(entry.path, `${name}.${index}.path`) } : {}),
            ...(entry.editable !== undefined
                ? { editable: editableScope(entry.editable, `${name}.${index}.editable`) }
                : {}),
        };
    });
}

function requiredId(value: unknown, name: string): string {
    const result = requiredText(value, name);
    if (!SIMPLE_ID.test(result)) {
        throw new InvalidParam(name, "must be a simple id.");
    }
    return result;
}

function requiredText(value: unknown, name: string): string {
    if (typeof value !== "string" || !value.trim()) {
        throw new MissingParam(name);
    }
    return value.trim();
}

function fieldType(value: unknown, name: string): SourceOverlayFieldType {
    if ((SOURCE_OVERLAY_FIELD_TYPES as readonly unknown[]).includes(value)) {
        return value as SourceOverlayFieldType;
    }
    throw new InvalidParam(name, `must be ${SOURCE_OVERLAY_FIELD_TYPES.join("|")}.`);
}

function editableScope(value: unknown, name: string): SourceOverlayEditableScope {
    if ((SOURCE_OVERLAY_EDITABLE_SCOPES as readonly unknown[]).includes(value)) {
        return value as SourceOverlayEditableScope;
    }
    throw new InvalidParam(name, `must be ${SOURCE_OVERLAY_EDITABLE_SCOPES.join("|")}.`);
}

function fieldPath(value: unknown, name: string): string {
    const result = requiredText(value, name);
    if (!FIELD_PATH.test(result)) {
        throw new InvalidParam(name, "must be a dotted object path.");
    }
    return result;
}

function targetPath(value: unknown, name: string): string {
    if (value === "") {
        return "";
    }
    const result = requiredText(value, name);
    if (!SAFE_PATH.test(result)) {
        throw new InvalidParam(name, "must be a dotted shape path.");
    }
    return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
