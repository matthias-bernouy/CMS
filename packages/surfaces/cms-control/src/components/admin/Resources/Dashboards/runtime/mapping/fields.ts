import type { DashboardField } from "@bernouy/cms-dashboards";
import type { WDetailField } from "../../widgets/w-detail/types";
import { formatDashboardValue } from "../../domain/formatting";
import { matchesDashboardVisibility, valueAt } from "../expressions";
import { mediaValue } from "../media";
import {
    isCreatable,
    numberValue,
    optionData,
    optionList,
    readonlyValue,
    recordValue,
    schemaDefinitions,
    tableValue,
    textValue,
    tokenValue,
} from "./fieldSupport";
import { currencyFractionDigits } from "./money";
import { reorderableField, tableColumn } from "./nestedFields";
import type { DetailOptions, DetailSchemas } from "./types";

export function detailField(
    field: DashboardField,
    resource: unknown,
    fields: Record<string, unknown>,
    options: DetailOptions,
    sourceId: string,
    schemas: DetailSchemas = {},
): WDetailField {
    const value = Object.hasOwn(fields, field.id) ? fields[field.id] : valueAt(resource, field.path);
    const base = {
        id: field.id,
        label: field.label,
        ...(field.required ? { required: true } : {}),
        ...("placeholder" in field && field.placeholder ? { placeholder: field.placeholder } : {}),
    };
    if (field.type === "number") {
        return {
            ...base,
            input: "number",
            value: numberValue(value),
            ...(field.min !== undefined ? { min: field.min } : {}),
            ...(field.max !== undefined ? { max: field.max } : {}),
            ...(field.step !== undefined ? { step: field.step } : {}),
        };
    }
    if (field.type === "money") {
        const currency = field.currencyPath
            ? textValue(valueAt(fields, field.currencyPath) ?? valueAt(resource, field.currencyPath))
            : "";
        const allowDecimals =
            field.allowDecimals === undefined
                ? true
                : typeof field.allowDecimals === "boolean"
                  ? field.allowDecimals
                  : matchesDashboardVisibility(field.allowDecimals, { fields, resource });
        return {
            ...base,
            input: "money",
            value: numberValue(value),
            ...(currency ? { currency } : {}),
            fractionDigits: currencyFractionDigits(currency || undefined),
            allowDecimals,
        };
    }
    if (field.type === "checkbox") {
        return { ...base, input: "checkbox", value: value === true };
    }
    if (field.type === "textarea") {
        return {
            ...base,
            input: "textarea",
            value: textValue(value),
            ...(field.rows !== undefined ? { rows: field.rows } : {}),
        };
    }
    if (field.type === "select") {
        return { ...base, input: "select", value: textValue(value), options: field.options.map(optionData) };
    }
    if (field.type === "combobox") {
        return {
            ...base,
            input: "combobox",
            value: textValue(value),
            options: optionList(field.options, options[field.id] ?? []),
            creatable: isCreatable(field),
        };
    }
    if (field.type === "tokens") {
        return {
            ...base,
            input: "tokens",
            value: tokenValue(value),
            options: optionList(field.options, options[field.id] ?? []),
            creatable: isCreatable(field),
        };
    }
    if (field.type === "table") {
        return {
            ...base,
            input: "table",
            value: tableValue(value),
            columns: field.columns.map((column) => tableColumn(field.id, column, options)),
            ...(field.derive ? { derive: field.derive } : {}),
            ...(field.editable === true ? { editable: true } : {}),
            ...(field.addLabel ? { addLabel: field.addLabel } : {}),
        };
    }
    if (field.type === "reorderable-list") {
        return {
            ...base,
            input: "reorderable-list",
            value: tableValue(value),
            itemKey: field.itemKey,
            ...(field.positionPath ? { positionPath: field.positionPath } : {}),
            reorderableFields: field.fields.map((item) => reorderableField(field.id, item, options)),
            ...(field.addLabel ? { addLabel: field.addLabel } : {}),
            ...(field.minItems !== undefined ? { minItems: field.minItems } : {}),
            ...(field.maxItems !== undefined ? { maxItems: field.maxItems } : {}),
        };
    }
    if (field.type === "schema") {
        const schema = schemas[field.id];
        return {
            ...base,
            input: "schema",
            value: recordValue(value),
            schemaDefinitions: schemaDefinitions(field, fields, schema?.definitions ?? []),
            schemaStatus: schema?.status ?? "loading",
        };
    }
    if (field.type === "media") {
        return { ...base, input: "media-list", value: mediaValue(value, field, sourceId), accept: "image/*" };
    }
    if (field.type === "readonly") {
        if (field.format === "image") {
            return { ...base, input: "image", value: textValue(value) };
        }
        if (field.format === "date" || field.format === "money") {
            return {
                ...base,
                input: "readonly",
                value: formatDashboardValue(value, field.format, {
                    currency: field.format === "money" ? detailCurrency(resource, fields, field.path) : undefined,
                }),
            };
        }
        return { ...base, input: field.format === "badge" ? "badge" : "readonly", value: readonlyValue(value) };
    }
    return { ...base, input: "text", value: textValue(value) };
}

function detailCurrency(resource: unknown, fields: Record<string, unknown>, valuePath: string): string | undefined {
    const separator = valuePath.lastIndexOf(".");
    const siblingPath = separator === -1 ? "currency" : `${valuePath.slice(0, separator)}.currency`;
    const value =
        valueAt(fields, "currency") ??
        valueAt(resource, siblingPath) ??
        (siblingPath === "currency" ? undefined : valueAt(resource, "currency"));
    const currency = textValue(value).trim();
    return currency || undefined;
}
