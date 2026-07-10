import type { WidgetAction } from "../shared";
import type { DashboardMediaItem } from "../w-media-field/types";

export type WDetailTableColumn = {
    key: string;
    label: string;
    path: string;
    width?: string;
    editable?: boolean;
    value?: "text" | "list";
};

export type WDetailTableDerive = {
    type: "cartesian";
    sourceField: string;
    labelPath: string;
    valuesPath: string;
};

export type WDetailTableRow = Record<string, unknown>;

export type WDetailReorderableListField = {
    id: string;
    label: string;
    path: string;
    required?: boolean;
    placeholder?: string;
};

export type WDetailFieldValue = string | string[] | DashboardMediaItem[] | WDetailTableRow[];

export type WDetailField = {
    id: string;
    label: string;
    value: WDetailFieldValue;
    input: "text" | "textarea" | "select" | "combobox" | "tokens" | "chips" | "media-list" | "table" | "reorderable-list" | "readonly" | "badge";
    options?: Array<{ label: string; value: string }>;
    columns?: WDetailTableColumn[];
    derive?: WDetailTableDerive;
    itemKey?: string;
    positionPath?: string;
    reorderableFields?: WDetailReorderableListField[];
    addLabel?: string;
    minItems?: number;
    maxItems?: number;
    editable?: boolean;
    placeholder?: string;
    creatable?: boolean;
    accept?: string;
};

export type WDetailSection = {
    title: string;
    description?: string;
    fields: WDetailField[];
};

export type WDetailData = {
    rowKey: string;
    eyebrow: string;
    title: string;
    status?: string;
    actions: WidgetAction[];
    main: WDetailSection[];
    aside: WDetailSection[];
};
