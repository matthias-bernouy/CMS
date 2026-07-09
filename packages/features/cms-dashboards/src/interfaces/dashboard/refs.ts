export type DashboardMeta = {
    name: string;
    icon?: string;
    svg?: string;
};

export type DashboardExpr = string;

export type DashboardEndpointRef = {
    sourceId?: string;
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

export type DashboardVisibilityRule = {
    field: string;
    equals?: string | number | boolean | null;
    notEquals?: string | number | boolean | null;
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
