import type {
    DashboardRelationProjection,
    RelationDashboardAction,
    RelationDashboardColumn,
} from "../../interfaces/Relation";
import {
    MAX_RELATION_LIMIT,
    RELATION_ACTION_EXPR,
    isRecord,
    validateEnum,
    validateExpressionMap,
    validateId,
    validatePath,
    validateRequiredId,
    validateRequiredPath,
} from "./primitives";

const WIDGETS = ["table", "summary", "link"] as const;
const PLACEMENTS = ["main", "side", "tab"] as const;
const FORMATS = ["text", "badge", "date", "money"] as const;
const ACTION_TONES = ["primary", "secondary", "danger"] as const;
const ACTION_PLACEMENTS = ["primary", "secondary", "more"] as const;

export function dashboardRelationProjectionId(projection: Pick<DashboardRelationProjection, "dashboardId" | "viewId" | "relationId">): string {
    return `${projection.dashboardId}:${projection.viewId}:${projection.relationId}`;
}

export function validateDashboardRelationProjection(projection: DashboardRelationProjection): string[] {
    const errors: string[] = [];
    if (!isRecord(projection)) return ["dashboardRelationProjection must be an object"];
    if (projection.type !== "dashboardRelation") errors.push("dashboardRelationProjection.type must be dashboardRelation");
    validateRequiredId("dashboardRelationProjection.relationId", projection.relationId, errors);
    validateRequiredId("dashboardRelationProjection.dashboardId", projection.dashboardId, errors);
    validateRequiredId("dashboardRelationProjection.viewId", projection.viewId, errors);
    validateEnum("dashboardRelationProjection.widget", projection.widget, WIDGETS, errors);
    if (projection.placement !== undefined) validateEnum("dashboardRelationProjection.placement", projection.placement, PLACEMENTS, errors);
    validateId("dashboardRelationProjection.sectionId", projection.sectionId, errors);
    validatePath("dashboardRelationProjection.rowKey", projection.rowKey, errors);
    if (projection.title !== undefined && (typeof projection.title !== "string" || !projection.title.trim())) {
        errors.push("dashboardRelationProjection.title must be non-empty when provided");
    }
    if (projection.pageSize !== undefined && (!Number.isInteger(projection.pageSize) || projection.pageSize < 1 || projection.pageSize > MAX_RELATION_LIMIT)) {
        errors.push(`dashboardRelationProjection.pageSize must be an integer between 1 and ${MAX_RELATION_LIMIT}`);
    }
    validateProjectionColumns(projection.columns, errors);
    validateProjectionActions(projection.actions, errors);
    return errors;
}

function validateProjectionColumns(columns: RelationDashboardColumn[] | undefined, errors: string[]): void {
    if (columns === undefined) return;
    if (!Array.isArray(columns)) return void errors.push("dashboardRelationProjection.columns must be an array");
    const seen = new Set<string>();
    for (const [index, column] of columns.entries()) {
        const path = `dashboardRelationProjection.columns.${index}`;
        if (!isRecord(column)) {
            errors.push(`${path} must be an object`);
            continue;
        }
        validateRequiredId(`${path}.id`, column.id, errors);
        if (column.id && seen.has(column.id)) errors.push(`${path}.id must be unique`);
        if (column.id) seen.add(column.id);
        if (typeof column.label !== "string" || !column.label.trim()) errors.push(`${path}.label is required`);
        validateRequiredPath(`${path}.path`, column.path, errors);
        if (column.width !== undefined && (typeof column.width !== "string" || !column.width.trim())) errors.push(`${path}.width must be non-empty when provided`);
        if (column.format !== undefined) validateEnum(`${path}.format`, column.format, FORMATS, errors);
    }
}

function validateProjectionActions(actions: RelationDashboardAction[] | undefined, errors: string[]): void {
    if (actions === undefined) return;
    if (!Array.isArray(actions)) return void errors.push("dashboardRelationProjection.actions must be an array");
    const seen = new Set<string>();
    for (const [index, action] of actions.entries()) {
        const path = `dashboardRelationProjection.actions.${index}`;
        if (!isRecord(action)) {
            errors.push(`${path} must be an object`);
            continue;
        }
        validateRequiredId(`${path}.id`, action.id, errors);
        if (action.id && seen.has(action.id)) errors.push(`${path}.id must be unique`);
        if (action.id) seen.add(action.id);
        if (typeof action.label !== "string" || !action.label.trim()) errors.push(`${path}.label is required`);
        if (action.tone !== undefined) validateEnum(`${path}.tone`, action.tone, ACTION_TONES, errors);
        if (action.placement !== undefined) validateEnum(`${path}.placement`, action.placement, ACTION_PLACEMENTS, errors);
        validateProjectionActionEndpoint(action, path, errors);
    }
}

function validateProjectionActionEndpoint(action: RelationDashboardAction, path: string, errors: string[]): void {
    if (!action.endpoint) return;
    validateId(`${path}.endpoint.sourceId`, action.endpoint.sourceId, errors);
    validateRequiredId(`${path}.endpoint.endpointId`, action.endpoint.endpointId, errors);
    if (action.endpoint.params !== undefined) validateExpressionMap(action.endpoint.params, `${path}.endpoint.params`, errors, RELATION_ACTION_EXPR);
    if (action.endpoint.body !== undefined) validateExpressionMap(action.endpoint.body, `${path}.endpoint.body`, errors, RELATION_ACTION_EXPR);
}
