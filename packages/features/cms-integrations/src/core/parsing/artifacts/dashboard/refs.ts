import { parseCreateOperation } from "./forms";
import type {
    DashboardDataRef,
    DashboardEmbeddedLookupRef,
    DashboardEndpointRef,
    DashboardLookupCreate,
    DashboardLookupRef,
    DashboardOption,
    DashboardResourceExpression,
} from "@bernouy/cms-dashboards";
import { DASHBOARD_MAX_OPTIONS } from "@bernouy/cms-dashboards";
import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import { isRecord, text } from "../../definition/values";
import { optionalText, parseStringList, parseStringMap, requiredText } from "../common";

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
    if (value.management !== undefined) {
        if (!isRecord(value.management) || value.management.operation !== "action") {
            throw new IntegrationInputError(`${name}.management`, "must declare a named action");
        }
        for (const key of ["endpoint", "sourceId", "params", "body"]) {
            if (Object.hasOwn(value, key)) {
                throw new IntegrationInputError(`${name}.${key}`, "cannot be combined with management");
            }
        }
        return {
            management: {
                installationId: requiredText(value.management.installationId, `${name}.management.installationId`),
                operation: "action",
                actionId: requiredText(value.management.actionId, `${name}.management.actionId`),
            },
        };
    }
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
        ...(value.edit !== undefined ? { edit: parseLookupCreate(value.edit, `${name}.edit`) } : {}),
    };
}

export function parseEmbeddedLookup(value: unknown, name: string): DashboardEmbeddedLookupRef {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    if (Object.hasOwn(value, "create") || Object.hasOwn(value, "edit")) {
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
    const ref = parseCreateOperation(value, name);
    if (ref.presentation !== "modal") {
        throw new IntegrationInputError(`${name}.presentation`, "must be modal for lookup details");
    }
    const record = value as Record<string, unknown>;
    return {
        ...ref,
        presentation: "modal",
        valuePath: requiredText(record.valuePath, `${name}.valuePath`),
        labelPath: requiredText(record.labelPath, `${name}.labelPath`),
    };
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
