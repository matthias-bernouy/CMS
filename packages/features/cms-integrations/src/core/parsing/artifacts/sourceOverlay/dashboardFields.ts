import type {
    SourceOverlayDashboardDataRef,
    SourceOverlayDashboardField,
    SourceOverlayDashboardFieldPatch,
    SourceOverlayDashboardLookupRef,
    SourceOverlayDashboardOption,
} from "@bernouy/cms-sources";
import { SOURCE_OVERLAY_DASHBOARD_FIELD_TYPES } from "@bernouy/cms-sources";
import { IntegrationInputError } from "../../../errors";
import { isRecord, text } from "../../values";
import { parseStringList, parseStringMap, requiredText } from "../common";

export function parseOverlayDashboardFields(value: unknown, name: string): SourceOverlayDashboardField[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => {
        if (!isRecord(entry)) {
            throw new IntegrationInputError(`${name}.${index}`, "must be an object");
        }
        return {
            ...(text(entry.dashboardId) ? { dashboardId: text(entry.dashboardId)! } : {}),
            viewId: requiredText(entry.viewId, `${name}.${index}.viewId`),
            ...(text(entry.fieldId) ? { fieldId: text(entry.fieldId)! } : {}),
            ...(text(entry.path) ? { path: text(entry.path)! } : {}),
            field: parseOverlayDashboardFieldPatch(entry.field, `${name}.${index}.field`),
        };
    });
}

function parseOverlayDashboardFieldPatch(value: unknown, name: string): SourceOverlayDashboardFieldPatch {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const type = parseOverlayDashboardFieldType(value.type, `${name}.type`);
    return {
        ...(text(value.label) ? { label: text(value.label)! } : {}),
        ...(type ? { type } : {}),
        ...(value.required === true ? { required: true } : {}),
        ...(value.options !== undefined
            ? { options: parseOverlayDashboardOptions(value.options, `${name}.options`) }
            : {}),
        ...(value.lookup !== undefined ? { lookup: parseOverlayDashboardLookup(value.lookup, `${name}.lookup`) } : {}),
        ...(value.allowCustom === true ? { allowCustom: true } : {}),
    };
}

function parseOverlayDashboardFieldType(
    value: unknown,
    name: string,
): SourceOverlayDashboardFieldPatch["type"] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const normalized = text(value);
    if (normalized && (SOURCE_OVERLAY_DASHBOARD_FIELD_TYPES as readonly string[]).includes(normalized)) {
        return normalized as SourceOverlayDashboardFieldPatch["type"];
    }
    throw new IntegrationInputError(name, `must be ${SOURCE_OVERLAY_DASHBOARD_FIELD_TYPES.join("|")}`);
}

export function parseOverlayDashboardOptions(value: unknown, name: string): SourceOverlayDashboardOption[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => {
        if (!isRecord(entry)) {
            throw new IntegrationInputError(`${name}.${index}`, "must be an object");
        }
        return {
            value: requiredText(entry.value, `${name}.${index}.value`),
            label: requiredText(entry.label, `${name}.${index}.label`),
            ...(text(entry.subtitle) ? { subtitle: text(entry.subtitle)! } : {}),
            ...(text(entry.media) ? { media: text(entry.media)! } : {}),
        };
    });
}

function parseOverlayDashboardLookup(value: unknown, name: string): SourceOverlayDashboardLookupRef {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return {
        ...parseOverlayDashboardDataRef(value, name),
        valuePath: requiredText(value.valuePath, `${name}.valuePath`),
        labelPath: requiredText(value.labelPath, `${name}.labelPath`),
        ...(text(value.subtitlePath) ? { subtitlePath: text(value.subtitlePath)! } : {}),
        ...(text(value.mediaPath) ? { mediaPath: text(value.mediaPath)! } : {}),
        ...(value.descriptionPaths !== undefined
            ? { descriptionPaths: parseStringList(value.descriptionPaths, `${name}.descriptionPaths`) }
            : {}),
        ...(value.selected !== undefined
            ? { selected: parseOverlayDashboardSelected(value.selected, `${name}.selected`) }
            : {}),
    };
}

function parseOverlayDashboardSelected(value: unknown, name: string): string {
    const expression = text(value);
    if (!expression) {
        throw new IntegrationInputError(name, "must be a non-empty string");
    }
    return expression;
}

function parseOverlayDashboardDataRef(value: Record<string, unknown>, name: string): SourceOverlayDashboardDataRef {
    return {
        ...parseOverlayDashboardEndpointRef(value, name),
        ...(text(value.itemsPath) ? { itemsPath: text(value.itemsPath)! } : {}),
        ...(text(value.itemPath) ? { itemPath: text(value.itemPath)! } : {}),
        ...(text(value.totalPath) ? { totalPath: text(value.totalPath)! } : {}),
    };
}

function parseOverlayDashboardEndpointRef(value: Record<string, unknown>, name: string): SourceOverlayDashboardDataRef {
    return {
        ...(text(value.sourceId) ? { sourceId: text(value.sourceId)! } : {}),
        endpoint: requiredText(value.endpoint, `${name}.endpoint`),
        ...(value.params !== undefined ? { params: parseStringMap(value.params, `${name}.params`) } : {}),
        ...(value.body !== undefined ? { body: parseStringMap(value.body, `${name}.body`) } : {}),
    };
}
