import type {
    SourceOverlay,
    SourceOverlayEditableScope,
    SourceOverlayEndpointTarget,
    SourceOverlayField,
    SourceOverlayFieldSource,
    SourceOverlayFieldSourceMap,
    SourceOverlayFieldType,
    SourceOverlaySection,
} from "@bernouy/cms-sources";
import { SOURCE_OVERLAY_EDITABLE_SCOPES, SOURCE_OVERLAY_FIELD_TYPES } from "@bernouy/cms-sources";
import { IntegrationInputError } from "../../../errors";
import { isRecord, text } from "../../values";
import { parseStringMap, requiredText } from "../common";
import { parseOverlayDashboardFields, parseOverlayDashboardOptions } from "./dashboardFields";

export function parseSourceOverlayTemplate(value: Record<string, unknown>, name: string): SourceOverlay {
    return {
        id: requiredText(value.id, `${name}.id`),
        sourceId: requiredText(value.sourceId, `${name}.sourceId`),
        ...(text(value.label) ? { label: text(value.label)! } : {}),
        ...(value.input !== undefined ? { input: parseOverlayTargets(value.input, `${name}.input`) } : {}),
        ...(value.output !== undefined ? { output: parseOverlayTargets(value.output, `${name}.output`) } : {}),
        ...(value.fieldSource !== undefined
            ? { fieldSource: parseOverlayFieldSource(value.fieldSource, `${name}.fieldSource`) }
            : {}),
        ...(value.sections !== undefined ? { sections: parseOverlaySections(value.sections, `${name}.sections`) } : {}),
        ...(value.dashboardFields !== undefined
            ? { dashboardFields: parseOverlayDashboardFields(value.dashboardFields, `${name}.dashboardFields`) }
            : {}),
        fields: value.fields === undefined ? [] : parseOverlayFields(value.fields, `${name}.fields`),
    };
}

function parseOverlayFieldSource(value: unknown, name: string): SourceOverlayFieldSource {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return {
        endpointId: requiredText(value.endpointId, `${name}.endpointId`),
        ...(value.params !== undefined ? { params: parseStringMap(value.params, `${name}.params`) } : {}),
        ...(text(value.path) ? { path: text(value.path)! } : {}),
        ...(value.map !== undefined ? { map: parseOverlayFieldSourceMap(value.map, `${name}.map`) } : {}),
    };
}

function parseOverlayFieldSourceMap(value: unknown, name: string): SourceOverlayFieldSourceMap {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return Object.fromEntries(
        Object.entries(value)
            .filter(([, path]) => text(path))
            .map(([key, path]) => [key, text(path)!]),
    ) as SourceOverlayFieldSourceMap;
}

function parseOverlayTargets(value: unknown, name: string): SourceOverlayEndpointTarget[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => {
        if (!isRecord(entry)) {
            throw new IntegrationInputError(`${name}.${index}`, "must be an object");
        }
        return {
            endpointId: requiredText(entry.endpointId, `${name}.${index}.endpointId`),
            ...(text(entry.path) ? { path: text(entry.path)! } : {}),
            ...(entry.editable !== undefined
                ? { editable: parseOverlayEditable(entry.editable, `${name}.${index}.editable`) }
                : {}),
        };
    });
}

function parseOverlayEditable(value: unknown, name: string): SourceOverlayEditableScope {
    if ((SOURCE_OVERLAY_EDITABLE_SCOPES as readonly unknown[]).includes(value)) {
        return value as SourceOverlayEditableScope;
    }
    throw new IntegrationInputError(name, `must be ${SOURCE_OVERLAY_EDITABLE_SCOPES.join("|")}`);
}

function parseOverlaySections(value: unknown, name: string): SourceOverlaySection[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => {
        if (!isRecord(entry)) {
            throw new IntegrationInputError(`${name}.${index}`, "must be an object");
        }
        return {
            id: requiredText(entry.id, `${name}.${index}.id`),
            label: requiredText(entry.label, `${name}.${index}.label`),
            ...(text(entry.description) ? { description: text(entry.description)! } : {}),
        };
    });
}

function parseOverlayFields(value: unknown, name: string): SourceOverlayField[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => {
        if (!isRecord(entry)) {
            throw new IntegrationInputError(`${name}.${index}`, "must be an object");
        }
        return {
            id: requiredText(entry.id, `${name}.${index}.id`),
            label: requiredText(entry.label, `${name}.${index}.label`),
            type: parseOverlayFieldType(entry.type, `${name}.${index}.type`),
            ...(text(entry.path) ? { path: text(entry.path)! } : {}),
            ...(text(entry.section) ? { section: text(entry.section)! } : {}),
            ...(entry.required === true ? { required: true } : {}),
            ...(entry.multiple === true ? { multiple: true } : {}),
            ...(entry.selfEditable === false ? { selfEditable: false } : {}),
            ...(entry.adminEditable === false ? { adminEditable: false } : {}),
            ...(entry.showInDashboardTable === true ? { showInDashboardTable: true } : {}),
            ...(entry.exposeToEditorSources === false ? { exposeToEditorSources: false } : {}),
            ...(entry.options !== undefined
                ? { options: parseOverlayDashboardOptions(entry.options, `${name}.${index}.options`) }
                : {}),
        };
    });
}

function parseOverlayFieldType(value: unknown, name: string): SourceOverlayFieldType {
    if ((SOURCE_OVERLAY_FIELD_TYPES as readonly unknown[]).includes(value)) {
        return value as SourceOverlayFieldType;
    }
    throw new IntegrationInputError(name, `must be ${SOURCE_OVERLAY_FIELD_TYPES.join("|")}`);
}
