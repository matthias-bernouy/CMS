import type { DashboardField, DashboardFieldBase } from "@bernouy/cms-dashboards";
import { IntegrationInputError } from "../../../../errors";
import { isRecord, text } from "../../../definition/values";
import { optionalBoolean, requiredText } from "../../common";
import { parseEndpointRef } from "../refs";

export function parseMediaField(
    base: DashboardFieldBase,
    value: Record<string, unknown>,
    name: string,
): Extract<DashboardField, { type: "media" }> {
    const multiple = optionalBoolean(value.multiple, `${name}.multiple`);
    return {
        ...base,
        type: "media",
        ...(multiple ? { multiple } : {}),
        item: parseMediaItem(value.item, `${name}.item`),
        ...(value.actions !== undefined ? { actions: parseMediaActions(value.actions, `${name}.actions`) } : {}),
    };
}

export function parseReadonlyFormat(
    value: unknown,
    name: string,
): Extract<DashboardField, { type: "readonly" }>["format"] | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (["date", "money", "badge", "text", "image", "url"].includes(value as string)) {
        return value as Extract<DashboardField, { type: "readonly" }>["format"];
    }
    throw new IntegrationInputError(name, "must be date, money, badge, text, image, or url");
}

function parseMediaItem(value: unknown, name: string): Extract<DashboardField, { type: "media" }>["item"] {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return {
        ...(text(value.idPath) ? { idPath: text(value.idPath)! } : {}),
        urlPath: requiredText(value.urlPath, `${name}.urlPath`),
        ...(text(value.altPath) ? { altPath: text(value.altPath)! } : {}),
    };
}

function parseMediaActions(value: unknown, name: string): Extract<DashboardField, { type: "media" }>["actions"] {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const actions: Extract<DashboardField, { type: "media" }>["actions"] = {};
    for (const action of ["upload", "replace", "remove", "reorder"] as const) {
        if (value[action] !== undefined) {
            if (!isRecord(value[action])) {
                throw new IntegrationInputError(`${name}.${action}`, "must be an object");
            }
            actions[action] = parseEndpointRef(value[action], `${name}.${action}`);
        }
    }
    return actions;
}
