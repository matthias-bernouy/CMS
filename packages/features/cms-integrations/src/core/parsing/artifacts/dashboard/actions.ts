import { isSafeDashboardExpression, type DashboardAction } from "@bernouy/cms-dashboards";
import { IntegrationInputError } from "../../../errors";
import { isRecord, text } from "../../definition/values";
import { requiredText, parseStringMap } from "../common";
import { parseEndpointRef } from "./refs";
import { parseVisibilityRule } from "./visibility";

export function parseActions(value: unknown, name: string): DashboardAction[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => parseAction(entry, `${name}.${index}`));
}

function parseAction(value: unknown, name: string): DashboardAction {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    if (value.endpoint !== undefined && !isRecord(value.endpoint)) {
        throw new IntegrationInputError(`${name}.endpoint`, "must be an object");
    }
    if (value.after !== undefined && !isRecord(value.after)) {
        throw new IntegrationInputError(`${name}.after`, "must be an object");
    }
    return {
        id: requiredText(value.id, `${name}.id`),
        label: requiredText(value.label, `${name}.label`),
        ...(text(value.icon) ? { icon: text(value.icon)! } : {}),
        ...(parseActionTone(value.tone, `${name}.tone`) ? { tone: parseActionTone(value.tone, `${name}.tone`)! } : {}),
        ...(parseActionPlacement(value.placement, `${name}.placement`)
            ? { placement: parseActionPlacement(value.placement, `${name}.placement`)! }
            : {}),
        ...(text(value.section) ? { section: text(value.section)! } : {}),
        ...(value.management !== undefined
            ? { management: parseManagementAction(value.management, `${name}.management`) }
            : {}),
        ...(value.endpoint !== undefined ? { endpoint: parseEndpointRef(value.endpoint, `${name}.endpoint`) } : {}),
        ...(value.download !== undefined ? { download: parseActionDownload(value.download, `${name}.download`) } : {}),
        ...(isRecord(value.selection) ? { selection: parseSelection(value.selection) } : {}),
        ...(isRecord(value.after) ? { after: parseActionAfter(value.after, `${name}.after`) } : {}),
        ...(text(value.confirm) ? { confirm: text(value.confirm)! } : {}),
        ...(value.visibleWhen !== undefined
            ? { visibleWhen: parseVisibilityRule(value.visibleWhen, `${name}.visibleWhen`) }
            : {}),
    };
}

export function parseSelection(value: Record<string, unknown>): { opens?: string } {
    return {
        ...(text(value.opens) ? { opens: text(value.opens)! } : {}),
    };
}

function parseActionAfter(value: Record<string, unknown>, name: string): NonNullable<DashboardAction["after"]> {
    const hasOpens = Object.hasOwn(value, "opens");
    const hasResource = Object.hasOwn(value, "resource");
    const opens = hasOpens ? requiredText(value.opens, `${name}.opens`) : undefined;
    const row = text(value.row);
    const resource = hasResource ? requiredText(value.resource, `${name}.resource`) : undefined;
    if (row && !opens) {
        throw new IntegrationInputError(`${name}.row`, "requires opens");
    }
    if (!hasOpens && !hasResource) {
        throw new IntegrationInputError(name, "must declare opens or resource");
    }
    if (resource && !isSafeDashboardExpression(resource, ["result"])) {
        throw new IntegrationInputError(`${name}.resource`, "must be a safe $result expression");
    }
    return {
        ...(opens ? { opens } : {}),
        ...(row ? { row } : {}),
        ...(resource ? { resource } : {}),
    };
}

function parseActionDownload(value: unknown, name: string): NonNullable<DashboardAction["download"]> {
    if (value === true) {
        return {};
    }
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be true or an object");
    }
    return {
        ...(text(value.filename) ? { filename: text(value.filename)! } : {}),
    };
}

function parseActionTone(value: unknown, name: string): DashboardAction["tone"] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (value === "primary" || value === "secondary" || value === "danger") {
        return value;
    }
    throw new IntegrationInputError(name, "must be primary, secondary, or danger");
}

function parseActionPlacement(value: unknown, name: string): DashboardAction["placement"] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (value === "primary" || value === "secondary" || value === "more") {
        return value;
    }
    throw new IntegrationInputError(name, "must be primary, secondary, or more");
}

function parseManagementAction(value: unknown, name: string): NonNullable<DashboardAction["management"]> {
    if (!isRecord(value) || (value.action !== "save-settings" && value.action !== "action")) {
        throw new IntegrationInputError(name, "must declare save-settings or action management action");
    }
    if (value.action === "save-settings" && value.actionId !== undefined) {
        throw new IntegrationInputError(name, "actionId requires action");
    }
    return {
        installationId: requiredText(value.installationId, `${name}.installationId`),
        ...(value.action === "action"
            ? ({ action: "action", actionId: requiredText(value.actionId, `${name}.actionId`) } as const)
            : ({ action: "save-settings" } as const)),
        ...(value.body !== undefined ? { body: parseStringMap(value.body, `${name}.body`) } : {}),
    };
}
