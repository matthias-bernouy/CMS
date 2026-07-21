import type {
    DashboardDataRef,
    DashboardEmbeddedLookupRef,
    DashboardEndpointRef,
    DashboardLookupCreate,
    DashboardLookupRef,
    DashboardOption,
    DashboardResourceExpression,
} from "@bernouy/cms-dashboards";
import { DASHBOARD_MAX_NESTED_FIELDS, DASHBOARD_MAX_OPTIONS } from "@bernouy/cms-dashboards";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { isRecord, text } from "../../values";
import { optionalText, parseStringList, parseStringMap, requiredText } from "../common";
import { parseFields } from "./fields";

export function parseDataRef(value: Record<string, unknown>, name: string): DashboardDataRef {
    const itemsPath = optionalText(value.itemsPath, `${name}.itemsPath`);
    const itemPath = optionalText(value.itemPath, `${name}.itemPath`);
    const totalPath = optionalText(value.totalPath, `${name}.totalPath`);
    return {
        ...parseEndpointRef(value, name),
        ...(itemsPath ? { itemsPath } : {}),
        ...(itemPath ? { itemPath } : {}),
        ...(totalPath ? { totalPath } : {}),
    };
}

export function parseEndpointRef(value: Record<string, unknown>, name: string): DashboardEndpointRef {
    const endpoint = text(value.endpoint);
    if (!endpoint) {
        throw new MissingIntegrationParam(`${name}.endpoint`);
    }
    const sourceId = optionalText(value.sourceId, `${name}.sourceId`);
    return {
        ...(sourceId ? { sourceId } : {}),
        endpoint,
        ...(value.params !== undefined ? { params: parseStringMap(value.params, `${name}.params`) } : {}),
        ...(value.body !== undefined ? { body: parseStringMap(value.body, `${name}.body`) } : {}),
    };
}

export function parseLookup(value: unknown, name: string): DashboardLookupRef {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return {
        ...parseEmbeddedLookupRecord(value, name),
        ...(value.descriptionPaths !== undefined
            ? { descriptionPaths: parseStringList(value.descriptionPaths, `${name}.descriptionPaths`) }
            : {}),
        ...(value.create !== undefined ? { create: parseLookupCreate(value.create, `${name}.create`) } : {}),
    };
}

export function parseEmbeddedLookup(value: unknown, name: string): DashboardEmbeddedLookupRef {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    if (Object.hasOwn(value, "create")) {
        throw new IntegrationInputError(`${name}.create`, "is not supported");
    }
    if (Object.hasOwn(value, "descriptionPaths")) {
        throw new IntegrationInputError(`${name}.descriptionPaths`, "is not supported");
    }
    return parseEmbeddedLookupRecord(value, name);
}

export function parseOptions(value: unknown, name: string): DashboardOption[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    if (value.length > DASHBOARD_MAX_OPTIONS) {
        throw new IntegrationInputError(name, `must contain at most ${DASHBOARD_MAX_OPTIONS} options`);
    }
    const options = value.map((entry, index) => parseOption(entry, `${name}.${index}`));
    const values = new Set<string>();
    for (const [index, option] of options.entries()) {
        if (values.has(option.value)) {
            throw new IntegrationInputError(`${name}.${index}.value`, "is duplicated");
        }
        values.add(option.value);
    }
    return options;
}

function parseEmbeddedLookupRecord(value: Record<string, unknown>, name: string): DashboardEmbeddedLookupRef {
    const subtitlePath = optionalText(value.subtitlePath, `${name}.subtitlePath`);
    const mediaPath = optionalText(value.mediaPath, `${name}.mediaPath`);
    return {
        ...parseDataRef(value, name),
        valuePath: requiredText(value.valuePath, `${name}.valuePath`),
        labelPath: requiredText(value.labelPath, `${name}.labelPath`),
        ...(subtitlePath ? { subtitlePath } : {}),
        ...(mediaPath ? { mediaPath } : {}),
        ...(value.selected !== undefined ? { selected: parseLookupSelected(value.selected, `${name}.selected`) } : {}),
    };
}

function parseLookupSelected(value: unknown, name: string): DashboardResourceExpression {
    const expression = text(value);
    if (!expression) {
        throw new IntegrationInputError(name, "must be a non-empty string");
    }
    return expression as DashboardResourceExpression;
}

function parseLookupCreate(value: unknown, name: string): DashboardLookupCreate {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const mode = requiredText(value.mode, `${name}.mode`);
    const base = {
        ...parseEndpointRef(value, name),
        valuePath: requiredText(value.valuePath, `${name}.valuePath`),
        labelPath: requiredText(value.labelPath, `${name}.labelPath`),
    };
    if (mode === "inline") {
        return { ...base, mode };
    }
    if (mode === "modal") {
        if (Array.isArray(value.fields) && value.fields.length > DASHBOARD_MAX_NESTED_FIELDS) {
            throw new IntegrationInputError(
                `${name}.fields`,
                `must contain at most ${DASHBOARD_MAX_NESTED_FIELDS} fields`,
            );
        }
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
    if (typeof value === "string") {
        return { value, label: value };
    }
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be a string or object");
    }
    return {
        value: requiredText(value.value, `${name}.value`),
        label: requiredText(value.label, `${name}.label`),
        ...(text(value.subtitle) ? { subtitle: text(value.subtitle)! } : {}),
        ...(text(value.media) ? { media: text(value.media)! } : {}),
    };
}
