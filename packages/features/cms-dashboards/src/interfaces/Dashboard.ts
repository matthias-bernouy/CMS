export type DashboardMeta = {
    name: string;
    icon?: string;
    svg?: string;
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
export type FieldFormat = ColumnFormat | "image" | "url";

export type ColumnSpec =
    | string
    | {
        field: string;
        label?: string;
        format?: ColumnFormat;
    };

export type FieldInput = "text" | "select" | "boolean" | "number" | "cms-user" | "file" | "lookup";

export type FieldMediaRef = CollectionEndpointRef;

export type FieldUploadRef = CollectionEndpointRef & {
    resultPath: string;
};

export type FieldLookupRef = CollectionListEndpointRef & {
    valuePath: string;
    labelPath: string;
    descriptionPaths?: string[];
    map?: Record<string, string>;
};

export type FieldSpec =
    | string
    | {
        field: string;
        label?: string;
        format?: FieldFormat;
        input?: FieldInput;
        options?: string[];
        accept?: string;
        media?: FieldMediaRef;
        upload?: FieldUploadRef;
        lookup?: FieldLookupRef;
        readonly?: boolean;
        required?: boolean;
    };

export type FilterSpec = {
    field: string;
    param?: string;
    input?: "text" | "select";
    label?: string;
    placeholder?: string;
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

export type WriteWidgetLabels = {
    label?: string;
    submitLabel?: string;
    successMessage?: string;
    resultFields?: FieldSpec[];
};

export type DeleteWidgetLabels = {
    label?: string;
    confirmLabel?: string;
    successMessage?: string;
    body?: Record<string, unknown>;
};

export type ActionWidgetLabels = {
    label: string;
    successMessage?: string;
    downloadName?: string;
    refresh?: boolean;
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
    | ({ widget: "w-create"; collection: string; fields?: FieldSpec[] } & WriteWidgetLabels)
    | ({ widget: "w-update"; collection: string; action?: "update" | "patch"; fields?: FieldSpec[] } & WriteWidgetLabels)
    | ({ widget: "w-delete"; collection: string } & DeleteWidgetLabels)
    | ({ widget: "w-action" } & CollectionEndpointRef & ActionWidgetLabels)
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
