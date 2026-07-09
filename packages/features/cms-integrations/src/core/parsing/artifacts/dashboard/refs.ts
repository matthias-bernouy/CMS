import type {
    DashboardDataRef,
    DashboardEndpointRef,
    DashboardLookupCreate,
    DashboardLookupRef,
    DashboardOption,
} from "@bernouy/cms-dashboards";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { isRecord, text } from "../../values";
import { parseStringList, parseStringMap, requiredText } from "../common";
import { parseFields } from "./fields";

export function parseDataRef(value: Record<string, unknown>, name: string): DashboardDataRef {
    return {
        ...parseEndpointRef(value, name),
        ...(text(value.itemsPath) ? { itemsPath: text(value.itemsPath)! } : {}),
        ...(text(value.itemPath) ? { itemPath: text(value.itemPath)! } : {}),
        ...(text(value.totalPath) ? { totalPath: text(value.totalPath)! } : {}),
    };
}

export function parseEndpointRef(value: Record<string, unknown>, name: string): DashboardEndpointRef {
    const endpoint = text(value.endpoint);
    if (!endpoint) throw new MissingIntegrationParam(`${name}.endpoint`);
    return {
        ...(text(value.sourceId) ? { sourceId: text(value.sourceId)! } : {}),
        endpoint,
        ...(value.params !== undefined ? { params: parseStringMap(value.params, `${name}.params`) } : {}),
        ...(value.body !== undefined ? { body: parseStringMap(value.body, `${name}.body`) } : {}),
    };
}

export function parseLookup(value: unknown, name: string): DashboardLookupRef {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        ...parseDataRef(value, name),
        valuePath: requiredText(value.valuePath, `${name}.valuePath`),
        labelPath: requiredText(value.labelPath, `${name}.labelPath`),
        ...(text(value.subtitlePath) ? { subtitlePath: text(value.subtitlePath)! } : {}),
        ...(text(value.mediaPath) ? { mediaPath: text(value.mediaPath)! } : {}),
        ...(value.descriptionPaths !== undefined ? { descriptionPaths: parseStringList(value.descriptionPaths, `${name}.descriptionPaths`) } : {}),
        ...(value.selected !== undefined ? { selected: parseLookupSelected(value.selected, `${name}.selected`) } : {}),
        ...(value.create !== undefined ? { create: parseLookupCreate(value.create, `${name}.create`) } : {}),
    };
}

export function parseOptions(value: unknown, name: string): DashboardOption[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseOption(entry, `${name}.${index}`));
}

function parseLookupSelected(value: unknown, name: string): DashboardDataRef {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return parseDataRef(value, name);
}

function parseLookupCreate(value: unknown, name: string): DashboardLookupCreate {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const mode = requiredText(value.mode, `${name}.mode`);
    const base = {
        ...parseEndpointRef(value, name),
        valuePath: requiredText(value.valuePath, `${name}.valuePath`),
        labelPath: requiredText(value.labelPath, `${name}.labelPath`),
    };
    if (mode === "inline") return { ...base, mode };
    if (mode === "modal") {
        return {
            ...base,
            mode,
            ...(text(value.title) ? { title: text(value.title)! } : {}),
            fields: parseFields(value.fields, `${name}.fields`),
        };
    }
    throw new IntegrationInputError(`${name}.mode`, "must be inline or modal");
}

function parseOption(value: unknown, name: string): DashboardOption {
    if (typeof value === "string") return { value, label: value };
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be a string or object");
    return {
        value: requiredText(value.value, `${name}.value`),
        label: requiredText(value.label, `${name}.label`),
        ...(text(value.subtitle) ? { subtitle: text(value.subtitle)! } : {}),
        ...(text(value.media) ? { media: text(value.media)! } : {}),
    };
}
