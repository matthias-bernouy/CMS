import {
    type SourceOverlay,
    type SourceOverlayEndpointTarget,
    type SourceOverlayField,
    type SourceOverlayFieldSource,
    type SourceOverlayFieldSourceMap,
    type SourceOverlaySection,
} from "@bernouy/cms-sources";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { parseSourceOverlayOptions } from "./parseSourceOverlayOptions";
import {
    editableScope,
    fieldPath,
    fieldType,
    isRecord,
    isSimpleId,
    requiredId,
    requiredText,
    targetPath,
} from "./valueParsers";

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
            if (!isSimpleId(key)) {
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
            ...(entry.nullable === true ? { nullable: true } : {}),
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
