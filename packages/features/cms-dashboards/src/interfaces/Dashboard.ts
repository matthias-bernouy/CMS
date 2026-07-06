export type DashboardMeta = {
    name: string;
    icon?: string;
    svg?: string;
};

export type DashboardExpr = string;

export type DashboardEndpointRef = {
    endpoint: string;
    params?: Record<string, DashboardExpr>;
    body?: Record<string, DashboardExpr>;
};

export type DashboardDataRef = DashboardEndpointRef & {
    itemsPath?: string;
    itemPath?: string;
    totalPath?: string;
};

export type DashboardBinding = {
    path: string;
    fallback?: string;
};

export type DashboardOption = {
    value: string;
    label: string;
    subtitle?: string;
    media?: string;
};

export type DashboardLookupCreate =
    | (DashboardEndpointRef & {
        mode: "inline";
        valuePath: string;
        labelPath: string;
    })
    | (DashboardEndpointRef & {
        mode: "modal";
        title?: string;
        valuePath: string;
        labelPath: string;
        fields: DashboardField[];
    });

export type DashboardLookupRef = DashboardDataRef & {
    valuePath: string;
    labelPath: string;
    subtitlePath?: string;
    mediaPath?: string;
    descriptionPaths?: string[];
    selected?: DashboardDataRef;
    create?: DashboardLookupCreate;
};

export type DashboardVisibilityRule = {
    field: string;
    equals?: string | number | boolean | null;
    notEquals?: string | number | boolean | null;
};

export type DashboardFieldBase = {
    id: string;
    label: string;
    path: string;
    required?: boolean;
    visibleWhen?: DashboardVisibilityRule;
};

export type DashboardSelectableField = {
    options?: DashboardOption[];
    lookup?: DashboardLookupRef;
    allowCustom?: boolean;
};

export type DashboardField =
    | (DashboardFieldBase & { type: "text"; placeholder?: string })
    | (DashboardFieldBase & { type: "textarea"; rows?: number })
    | (DashboardFieldBase & { type: "select"; options: DashboardOption[] })
    | (DashboardFieldBase & { type: "combobox" } & DashboardSelectableField)
    | (DashboardFieldBase & { type: "tokens" } & DashboardSelectableField)
    | (DashboardFieldBase & {
        type: "table";
        columns: DashboardTableColumn[];
        editable?: boolean;
        derive?: DashboardTableDerive;
    })
    | (DashboardFieldBase & {
        type: "media";
        multiple?: boolean;
        item: {
            idPath?: string;
            urlPath: string;
            altPath?: string;
        };
        actions?: Partial<Record<"upload" | "replace" | "remove" | "reorder", DashboardEndpointRef>>;
    })
    | (DashboardFieldBase & {
        type: "readonly";
        format?: "text" | "badge" | "date" | "money" | "url" | "image";
    });

export type DashboardSection = {
    id: string;
    title: string;
    description?: string;
    fields: DashboardField[];
};

export type DashboardColumn = {
    id: string;
    label: string;
    path: string;
    primary?: boolean;
    width?: string;
    format?: "text" | "badge" | "date" | "money";
};

export type DashboardTableColumn = DashboardColumn & {
    editable?: boolean;
    value?: "text" | "list";
};

export type DashboardTableDerive = {
    type: "cartesian";
    sourceField: string;
    labelPath: string;
    valuesPath: string;
};

export type DashboardFilter = {
    id: string;
    label: string;
    path?: string;
    param?: string;
    type?: "text" | "select";
    placeholder?: string;
    options?: DashboardOption[];
};

export type DashboardAction = {
    id: string;
    label: string;
    icon?: string;
    tone?: "primary" | "secondary" | "danger";
    placement?: "primary" | "secondary" | "more";
    section?: string;
    endpoint?: DashboardEndpointRef;
    download?: {
        filename?: string;
    };
    selection?: { opens?: string };
    confirm?: string;
};

export type DashboardWidget =
    | {
        widget: "w-table";
        id: string;
        title?: string;
        source: DashboardDataRef;
        rowKey: string;
        columns: DashboardColumn[];
        filters?: DashboardFilter[];
        pageSize?: number;
        selection?: { opens?: string };
        actions?: DashboardAction[];
    }
    | {
        widget: "w-detail";
        id: string;
        source: DashboardDataRef;
        title?: DashboardBinding;
        status?: DashboardBinding;
        actions?: DashboardAction[];
        main: DashboardSection[];
        aside?: DashboardSection[];
    }
    | {
        widget: "w-section";
        id: string;
        title: string;
        description?: string;
        children: DashboardWidget[];
    }
    | {
        widget: "w-tabs";
        id: string;
        tabs: Array<{ id: string; label: string; children: DashboardWidget[] }>;
    };

export type DashboardDefinition = {
    id: string;
    meta?: DashboardMeta;
    source: string;
    views: DashboardWidget[];
    requires?: string;
};

export type DashboardDto = DashboardDefinition;
export type Dashboard = DashboardDefinition;
