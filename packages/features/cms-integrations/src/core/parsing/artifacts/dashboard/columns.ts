import type { DashboardColumn, DashboardFilter } from "@bernouy/cms-dashboards";
import { IntegrationInputError } from "../../../errors";
import { isRecord, text } from "../../values";
import { requiredText } from "../common";
import { parseOptions } from "./refs";

export function parseColumns(value: unknown, name: string): DashboardColumn[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseColumn(entry, `${name}.${index}`));
}

export function parseColumn(value: unknown, name: string): DashboardColumn {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        id: requiredText(value.id, `${name}.id`),
        label: requiredText(value.label, `${name}.label`),
        path: requiredText(value.path, `${name}.path`),
        ...(value.primary === true ? { primary: true } : {}),
        ...(text(value.width) ? { width: text(value.width)! } : {}),
        ...(parseColumnFormat(value.format, `${name}.format`) ? { format: parseColumnFormat(value.format, `${name}.format`)! } : {}),
    };
}

export function parseFilters(value: unknown, name: string): DashboardFilter[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseFilter(entry, `${name}.${index}`));
}

function parseColumnFormat(value: unknown, name: string): DashboardColumn["format"] | undefined {
    if (value === undefined) return undefined;
    if (value === "date" || value === "money" || value === "badge" || value === "text") return value;
    throw new IntegrationInputError(name, "must be date, money, badge, or text");
}

function parseFilter(value: unknown, name: string): DashboardFilter {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        id: requiredText(value.id, `${name}.id`),
        label: requiredText(value.label, `${name}.label`),
        ...(text(value.path) ? { path: text(value.path)! } : {}),
        ...(text(value.param) ? { param: text(value.param)! } : {}),
        ...(value.type === "select" ? { type: "select" } : value.type === "text" ? { type: "text" } : {}),
        ...(text(value.placeholder) ? { placeholder: text(value.placeholder)! } : {}),
        ...(value.options !== undefined ? { options: parseOptions(value.options, `${name}.options`) } : {}),
    };
}
