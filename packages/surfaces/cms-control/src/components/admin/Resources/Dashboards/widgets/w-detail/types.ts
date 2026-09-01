import type { WidgetAction } from "../shared";
import type { DashboardMediaItem } from "../w-media-field/types";

type WDetailOption = { label: string; value: string };

type WDetailNestedFieldBase = {
    key: string;
    label: string;
    path: string;
    width?: string;
    format?: "text" | "badge" | "date" | "money";
};

export type WDetailTableColumn = WDetailNestedFieldBase &
    (
        | { editable?: false; type?: never; options?: never }
        | { editable: true; type: "text" | "tokens"; options?: never }
        | { editable: true; type: "select"; options: WDetailOption[] }
        | { editable: true; type: "combobox"; options: WDetailOption[] }
    );

export type WDetailTableDerive = {
    type: "cartesian";
    sourceField: string;
    labelPath: string;
    valuesPath: string;
};

export type WDetailTableRow = Record<string, unknown>;

export type WDetailSchemaDefinition = {
    id: string;
    label: string;
    type: "string" | "number" | "boolean";
    required?: boolean;
    unit?: string;
    options?: WDetailOption[];
};

type WDetailReorderableListFieldBase = {
    id: string;
    label: string;
    path: string;
    required?: boolean;
    placeholder?: string;
};

export type WDetailReorderableListField = WDetailReorderableListFieldBase &
    (
        | { type: "text" | "checkbox"; options?: never }
        | { type: "select"; options: WDetailOption[] }
        | { type: "combobox"; options: WDetailOption[] }
    );

export type WDetailFieldValue =
    | string
    | number
    | boolean
    | string[]
    | DashboardMediaItem[]
    | WDetailTableRow[]
    | Record<string, unknown>;

export type WDetailField = {
    id: string;
    label: string;
    value: WDetailFieldValue;
    input:
        | "text"
        | "number"
        | "money"
        | "checkbox"
        | "textarea"
        | "select"
        | "cms-user"
        | "combobox"
        | "tokens"
        | "chips"
        | "media-list"
        | "table"
        | "reorderable-list"
        | "schema"
        | "image"
        | "readonly"
        | "badge";
    options?: WDetailOption[];
    columns?: WDetailTableColumn[];
    derive?: WDetailTableDerive;
    itemKey?: string;
    positionPath?: string;
    reorderableFields?: WDetailReorderableListField[];
    schemaDefinitions?: WDetailSchemaDefinition[];
    schemaStatus?: "loading" | "ready" | "error";
    addLabel?: string;
    minItems?: number;
    maxItems?: number;
    editable?: boolean;
    required?: boolean;
    invalid?: boolean;
    hint?: string;
    hintLevel?: "info" | "success" | "error";
    placeholder?: string;
    rows?: number;
    min?: number;
    max?: number;
    step?: number;
    currency?: string;
    fractionDigits?: number;
    allowDecimals?: boolean;
    creatable?: boolean;
    accept?: string;
};

export type WDetailSection = {
    title: string;
    description?: string;
    fields: WDetailField[];
    widgetSlot?: string;
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
