import type { CmsRelation, DashboardRelationProjection } from "@bernouy/cms-relations";

export function isRelation(value: unknown): value is CmsRelation {
    return (
        !!value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof (value as { id?: unknown }).id === "string" &&
        typeof (value as { from?: { sourceId?: unknown } }).from?.sourceId === "string" &&
        typeof (value as { to?: { sourceId?: unknown } }).to?.sourceId === "string" &&
        ((value as { cardinality?: unknown }).cardinality === "one" ||
            (value as { cardinality?: unknown }).cardinality === "many") &&
        !!(value as { binding?: unknown }).binding
    );
}

export function isDashboardRelationProjection(value: unknown): value is DashboardRelationProjection {
    return (
        !!value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        (value as { type?: unknown }).type === "dashboardRelation" &&
        typeof (value as { relationId?: unknown }).relationId === "string" &&
        typeof (value as { dashboardId?: unknown }).dashboardId === "string" &&
        typeof (value as { viewId?: unknown }).viewId === "string" &&
        typeof (value as { widget?: unknown }).widget === "string"
    );
}
