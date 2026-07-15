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

export type DashboardResourceExpression = `$resource.${string}`;
export type DashboardFieldExpression = `$field.${string}`;

export type DashboardLookupPresentation = {
    valuePath: string;
    labelPath: string;
    subtitlePath?: string;
    mediaPath?: string;
    selected?: DashboardResourceExpression;
};

export type DashboardEmbeddedLookupRef = DashboardDataRef & DashboardLookupPresentation;

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

export type DashboardVisibilityValue = string | number | boolean | null;

export type DashboardVisibilityCondition = {
    value: DashboardExpr;
} & ({
    equals: DashboardVisibilityValue;
    notEquals?: never;
} | {
    equals?: never;
    notEquals: DashboardVisibilityValue;
});

export type DashboardVisibilityRule = DashboardVisibilityCondition | {
    all: DashboardVisibilityRule[];
} | {
    any: DashboardVisibilityRule[];
};

export type DashboardColumn = {
    id: string;
    label: string;
    path: string;
    primary?: boolean;
    width?: string;
    format?: "text" | "badge" | "date" | "money";
};

type DashboardEditableTableColumn = {
    editable?: boolean;
    value?: "text" | "list";
};

export type DashboardTableColumn = DashboardColumn & DashboardEditableTableColumn & (
    | { type?: "text"; options?: never; lookup?: never }
    | { type: "select"; options: DashboardOption[]; lookup?: never }
    | { type: "combobox"; options?: DashboardOption[]; lookup?: DashboardEmbeddedLookupRef }
    | { type: "tokens"; options?: never; lookup?: never }
);

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
