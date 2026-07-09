export const RELATION_CARDINALITIES = ["one", "many"] as const;
export type RelationCardinality = typeof RELATION_CARDINALITIES[number];

export const RELATION_BINDING_KINDS = ["reference", "linkTable"] as const;
export type RelationBindingKind = typeof RELATION_BINDING_KINDS[number];

export type RelationSide = {
    sourceId: string;
    label?: string;
    /**
     * Dotted object path used to read the side id from a runtime item.
     * Defaults to `id`.
     */
    idPath?: string;
};

export type RelationEndpointRef = {
    sourceId: string;
    endpointId: string;
};

export type ReferenceRelationBinding = {
    kind: "reference";
    endpoint: RelationEndpointRef;
    params: Record<string, string>;
};

export type LinkTableRelationBinding = {
    kind: "linkTable";
    sourceId: string;
    listEndpointId: string;
    createEndpointId?: string;
    deleteEndpointId?: string;
    fromIdParam: string;
    toIdParam: string;
    itemsPath: string;
    targetIdPath: string;
    target?: {
        sourceId: string;
        endpointId: string;
        idParam: string;
        batchEndpointId?: string;
        batchIdsParam?: string;
        batchItemsPath?: string;
    };
};

export type RelationBinding =
    | ReferenceRelationBinding
    | LinkTableRelationBinding;

export type RelationPageContract = {
    itemsPath: string;
    totalPath?: string;
    limitParam?: string;
    offsetParam?: string;
    cursorParam?: string;
    nextCursorPath?: string;
    defaultLimit?: number;
    maxLimit?: number;
};

export type CmsRelation = {
    id: string;
    label?: string;
    from: RelationSide;
    to: RelationSide;
    cardinality: RelationCardinality;
    binding: RelationBinding;
    page?: RelationPageContract;
};

export type DashboardRelationProjection = {
    type: "dashboardRelation";
    relationId: string;
    dashboardId: string;
    viewId: string;
    placement?: "main" | "side" | "tab";
    sectionId?: string;
    title?: string;
    widget: "table" | "summary" | "link";
    pageSize?: number;
    rowKey?: string;
    columns?: RelationDashboardColumn[];
    actions?: RelationDashboardAction[];
};

export type RelationDashboardColumn = {
    id: string;
    label: string;
    path: string;
    primary?: boolean;
    width?: string;
    format?: "text" | "badge" | "date" | "money";
};

export type RelationDashboardAction = {
    id: string;
    label: string;
    icon?: string;
    tone?: "primary" | "secondary" | "danger";
    placement?: "primary" | "secondary" | "more";
    endpoint?: {
        sourceId?: string;
        endpointId: string;
        params?: Record<string, string>;
        body?: Record<string, string>;
    };
};
