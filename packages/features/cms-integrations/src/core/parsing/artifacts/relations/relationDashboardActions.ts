import type { RelationDashboardAction } from "@bernouy/cms-relations";
import { IntegrationInputError } from "../../../errors";
import { isRecord, text } from "../../values";
import { parseStringRecord, requiredText } from "../common";

export function parseRelationDashboardActions(value: unknown, name: string): RelationDashboardAction[] {
    if (!Array.isArray(value)) throw new IntegrationInputError(name, "must be an array");
    return value.map((entry, index) => {
        if (!isRecord(entry)) throw new IntegrationInputError(`${name}.${index}`, "must be an object");
        return {
            id: requiredText(entry.id, `${name}.${index}.id`),
            label: requiredText(entry.label, `${name}.${index}.label`),
            ...(text(entry.icon) ? { icon: text(entry.icon)! } : {}),
            ...(text(entry.tone) ? { tone: text(entry.tone)! as RelationDashboardAction["tone"] } : {}),
            ...(text(entry.placement) ? { placement: text(entry.placement)! as RelationDashboardAction["placement"] } : {}),
            ...(entry.endpoint !== undefined ? { endpoint: parseRelationDashboardActionEndpoint(entry.endpoint, `${name}.${index}.endpoint`) } : {}),
        };
    });
}

function parseRelationDashboardActionEndpoint(value: unknown, name: string): NonNullable<RelationDashboardAction["endpoint"]> {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    return {
        ...(text(value.sourceId) ? { sourceId: text(value.sourceId)! } : {}),
        endpointId: requiredText(value.endpointId, `${name}.endpointId`),
        ...(value.params !== undefined ? { params: parseStringRecord(value.params, `${name}.params`) } : {}),
        ...(value.body !== undefined ? { body: parseStringRecord(value.body, `${name}.body`) } : {}),
    };
}
