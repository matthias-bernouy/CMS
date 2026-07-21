import type {
    CmsRelation,
    DashboardRelationProjection,
    LinkTableRelationBinding,
    ReferenceRelationBinding,
    RelationBinding,
    RelationDashboardColumn,
    RelationEndpointRef,
    RelationPageContract,
    RelationSide,
} from "@bernouy/cms-relations";
import { RELATION_CARDINALITIES } from "@bernouy/cms-relations";
import { IntegrationInputError } from "../../../errors";
import { isRecord, text } from "../../values";
import { parseStringRecord, requiredText } from "../common";
import { parseRelationDashboardActions } from "./relationDashboardActions";

export function parseRelationTemplate(value: Record<string, unknown>, name: string): CmsRelation {
    return {
        id: requiredText(value.id, `${name}.id`),
        ...(text(value.label) ? { label: text(value.label)! } : {}),
        from: parseRelationSide(value.from, `${name}.from`),
        to: parseRelationSide(value.to, `${name}.to`),
        cardinality: parseRelationCardinality(value.cardinality, `${name}.cardinality`),
        binding: parseRelationBinding(value.binding, `${name}.binding`),
        ...(value.page !== undefined ? { page: parseRelationPage(value.page, `${name}.page`) } : {}),
    };
}

export function parseDashboardRelationProjectionTemplate(
    value: Record<string, unknown>,
    name: string,
): DashboardRelationProjection {
    return {
        type: "dashboardRelation",
        relationId: requiredText(value.relationId, `${name}.relationId`),
        dashboardId: requiredText(value.dashboardId, `${name}.dashboardId`),
        viewId: requiredText(value.viewId, `${name}.viewId`),
        ...(text(value.placement)
            ? { placement: text(value.placement)! as DashboardRelationProjection["placement"] }
            : {}),
        ...(text(value.sectionId) ? { sectionId: text(value.sectionId)! } : {}),
        ...(text(value.title) ? { title: text(value.title)! } : {}),
        widget: requiredText(value.widget, `${name}.widget`) as DashboardRelationProjection["widget"],
        ...(typeof value.pageSize === "number" ? { pageSize: value.pageSize } : {}),
        ...(text(value.rowKey) ? { rowKey: text(value.rowKey)! } : {}),
        ...(value.columns !== undefined
            ? { columns: parseRelationDashboardColumns(value.columns, `${name}.columns`) }
            : {}),
        ...(value.actions !== undefined
            ? { actions: parseRelationDashboardActions(value.actions, `${name}.actions`) }
            : {}),
    };
}

function parseRelationSide(value: unknown, name: string): RelationSide {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return {
        sourceId: requiredText(value.sourceId, `${name}.sourceId`),
        ...(text(value.label) ? { label: text(value.label)! } : {}),
        ...(text(value.idPath) ? { idPath: text(value.idPath)! } : {}),
    };
}

function parseRelationCardinality(value: unknown, name: string): CmsRelation["cardinality"] {
    if ((RELATION_CARDINALITIES as readonly unknown[]).includes(value)) {
        return value as CmsRelation["cardinality"];
    }
    throw new IntegrationInputError(name, `must be ${RELATION_CARDINALITIES.join("|")}`);
}

function parseRelationBinding(value: unknown, name: string): RelationBinding {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const kind = text(value.kind);
    if (kind === "reference") {
        return parseReferenceRelationBinding(value, name);
    }
    if (kind === "linkTable") {
        return parseLinkTableRelationBinding(value, name);
    }
    throw new IntegrationInputError(`${name}.kind`, "must be reference or linkTable");
}

function parseReferenceRelationBinding(value: Record<string, unknown>, name: string): ReferenceRelationBinding {
    return {
        kind: "reference",
        endpoint: parseRelationEndpointRef(value.endpoint, `${name}.endpoint`),
        params: parseStringRecord(value.params, `${name}.params`),
    };
}

function parseLinkTableRelationBinding(value: Record<string, unknown>, name: string): LinkTableRelationBinding {
    return {
        kind: "linkTable",
        sourceId: requiredText(value.sourceId, `${name}.sourceId`),
        listEndpointId: requiredText(value.listEndpointId, `${name}.listEndpointId`),
        ...(text(value.createEndpointId) ? { createEndpointId: text(value.createEndpointId)! } : {}),
        ...(text(value.deleteEndpointId) ? { deleteEndpointId: text(value.deleteEndpointId)! } : {}),
        fromIdParam: requiredText(value.fromIdParam, `${name}.fromIdParam`),
        toIdParam: requiredText(value.toIdParam, `${name}.toIdParam`),
        itemsPath: requiredText(value.itemsPath, `${name}.itemsPath`),
        targetIdPath: requiredText(value.targetIdPath, `${name}.targetIdPath`),
        ...(value.target !== undefined ? { target: parseLinkTableTarget(value.target, `${name}.target`) } : {}),
    };
}

function parseLinkTableTarget(value: unknown, name: string): NonNullable<LinkTableRelationBinding["target"]> {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return {
        sourceId: requiredText(value.sourceId, `${name}.sourceId`),
        endpointId: requiredText(value.endpointId, `${name}.endpointId`),
        idParam: requiredText(value.idParam, `${name}.idParam`),
        ...(text(value.batchEndpointId) ? { batchEndpointId: text(value.batchEndpointId)! } : {}),
        ...(text(value.batchIdsParam) ? { batchIdsParam: text(value.batchIdsParam)! } : {}),
        ...(text(value.batchItemsPath) ? { batchItemsPath: text(value.batchItemsPath)! } : {}),
    };
}

function parseRelationEndpointRef(value: unknown, name: string): RelationEndpointRef {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return {
        sourceId: requiredText(value.sourceId, `${name}.sourceId`),
        endpointId: requiredText(value.endpointId, `${name}.endpointId`),
    };
}

function parseRelationPage(value: unknown, name: string): RelationPageContract {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    return {
        itemsPath: requiredText(value.itemsPath, `${name}.itemsPath`),
        ...(text(value.totalPath) ? { totalPath: text(value.totalPath)! } : {}),
        ...(text(value.limitParam) ? { limitParam: text(value.limitParam)! } : {}),
        ...(text(value.offsetParam) ? { offsetParam: text(value.offsetParam)! } : {}),
        ...(text(value.cursorParam) ? { cursorParam: text(value.cursorParam)! } : {}),
        ...(text(value.nextCursorPath) ? { nextCursorPath: text(value.nextCursorPath)! } : {}),
        ...(typeof value.defaultLimit === "number" ? { defaultLimit: value.defaultLimit } : {}),
        ...(typeof value.maxLimit === "number" ? { maxLimit: value.maxLimit } : {}),
    };
}

function parseRelationDashboardColumns(value: unknown, name: string): RelationDashboardColumn[] {
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    return value.map((entry, index) => {
        if (!isRecord(entry)) {
            throw new IntegrationInputError(`${name}.${index}`, "must be an object");
        }
        return {
            id: requiredText(entry.id, `${name}.${index}.id`),
            label: requiredText(entry.label, `${name}.${index}.label`),
            path: requiredText(entry.path, `${name}.${index}.path`),
            ...(entry.primary === true ? { primary: true } : {}),
            ...(text(entry.width) ? { width: text(entry.width)! } : {}),
            ...(text(entry.format) ? { format: text(entry.format)! as RelationDashboardColumn["format"] } : {}),
        };
    });
}
