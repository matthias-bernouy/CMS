export type DashboardMeta = {
    name: string;
    icon?: string;
};

export type ParamExpr = string;

export type CollectionEndpointRef = {
    endpoint: string;
    params?: Record<string, ParamExpr>;
};

export type CollectionListEndpointRef = CollectionEndpointRef & {
    itemsPath?: string;
    totalPath?: string;
};

export type CollectionItemEndpoints = {
    get?: CollectionEndpointRef;
    create?: CollectionEndpointRef;
    update?: CollectionEndpointRef;
    patch?: CollectionEndpointRef;
    delete?: CollectionEndpointRef;
};

export type Collection = {
    id: string;
    rowKey?: string;
    list: CollectionListEndpointRef;
    item?: CollectionItemEndpoints;
};

export type ColumnFormat = "date" | "money" | "badge" | "text";

export type ColumnSpec =
    | string
    | {
        field: string;
        label?: string;
        format?: ColumnFormat;
    };

export type FieldInput = "text" | "select" | "boolean" | "number";

export type FieldSpec =
    | string
    | {
        field: string;
        label?: string;
        input?: FieldInput;
        readonly?: boolean;
        required?: boolean;
    };

export type FilterSpec = {
    field: string;
    param?: string;
    input?: "text" | "select";
    options?: string[];
};

export type RowAction = {
    widget: "w-table-row-action";
    label: string;
    action: keyof CollectionItemEndpoints;
    body?: Record<string, unknown>;
    confirm?: boolean;
    requires?: string;
};

export type DashboardWidget =
    | { widget: "w-section"; title?: string; children: DashboardWidget[] }
    | { widget: "w-tabs"; tabs: Array<{ label: string; children: DashboardWidget[] }> }
    | {
        widget: "w-table";
        collection: string;
        columns?: ColumnSpec[];
        rowActions?: RowAction[];
        filters?: FilterSpec[];
        pageSize?: number;
    }
    | { widget: "w-detail"; collection: string; fields?: FieldSpec[] }
    | { widget: "w-detail-item-put"; collection: string; fields?: FieldSpec[] }
    | { widget: "w-detail-patch"; collection: string; fields?: FieldSpec[] }
    | { widget: "w-create"; collection: string; fields?: FieldSpec[] }
    | { widget: "w-stat"; endpoint: string; path: string; label?: string };

export type DashboardDto = {
    id: string;
    meta?: DashboardMeta;
    source: string;
    collections: Collection[];
    views: DashboardWidget[];
    requires?: string;
};

export type Dashboard = DashboardDto;
