import type { DashboardAction } from "@bernouy/cms-dashboards";
import { IntegrationInputError } from "../../../errors";
import { isRecord, text } from "../../values";
import { requiredText } from "../common";
import { parseEndpointRef } from "./refs";

export function parseActions(value: unknown, name: string): DashboardAction[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => parseAction(entry, `${name}.${index}`));
}

function parseAction(value: unknown, name: string): DashboardAction {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    if (value.endpoint !== undefined && !isRecord(value.endpoint)) throw new IntegrationInputError(`${name}.endpoint`, "must be an object");
    if (value.after !== undefined && !isRecord(value.after)) throw new IntegrationInputError(`${name}.after`, "must be an object");
    return {
        id: requiredText(value.id, `${name}.id`),
        label: requiredText(value.label, `${name}.label`),
        ...(text(value.icon) ? { icon: text(value.icon)! } : {}),
        ...(parseActionTone(value.tone, `${name}.tone`) ? { tone: parseActionTone(value.tone, `${name}.tone`)! } : {}),
        ...(parseActionPlacement(value.placement, `${name}.placement`) ? { placement: parseActionPlacement(value.placement, `${name}.placement`)! } : {}),
        ...(text(value.section) ? { section: text(value.section)! } : {}),
        ...(value.endpoint !== undefined ? { endpoint: parseEndpointRef(value.endpoint, `${name}.endpoint`) } : {}),
        ...(value.download !== undefined ? { download: parseActionDownload(value.download, `${name}.download`) } : {}),
        ...(isRecord(value.selection) ? { selection: parseSelection(value.selection) } : {}),
        ...(isRecord(value.after) ? { after: parseActionAfter(value.after, `${name}.after`) } : {}),
        ...(text(value.confirm) ? { confirm: text(value.confirm)! } : {}),
    };
}

export function parseSelection(value: Record<string, unknown>): { opens?: string } {
    return {
        ...(text(value.opens) ? { opens: text(value.opens)! } : {}),
    };
}

function parseActionAfter(value: Record<string, unknown>, name: string): NonNullable<DashboardAction["after"]> {
    return {
        opens: requiredText(value.opens, `${name}.opens`),
        ...(text(value.row) ? { row: text(value.row)! } : {}),
    };
}

function parseActionDownload(value: unknown, name: string): NonNullable<DashboardAction["download"]> {
    if (value === true) return {};
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be true or an object");
    return {
        ...(text(value.filename) ? { filename: text(value.filename)! } : {}),
    };
}

function parseActionTone(value: unknown, name: string): DashboardAction["tone"] | undefined {
    if (value === undefined) return undefined;
    if (value === "primary" || value === "secondary" || value === "danger") return value;
    throw new IntegrationInputError(name, "must be primary, secondary, or danger");
}

function parseActionPlacement(value: unknown, name: string): DashboardAction["placement"] | undefined {
    if (value === undefined) return undefined;
    if (value === "primary" || value === "secondary" || value === "more") return value;
    throw new IntegrationInputError(name, "must be primary, secondary, or more");
}
