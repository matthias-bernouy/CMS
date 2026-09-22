export type DataExpression = string;

export type DataFieldType = "string" | "number" | "boolean" | "date" | "object" | "array" | "unknown";

export type DataField = {
    path: DataExpression;
    label?: string;
    type?: DataFieldType;
    children?: DataField[];
};

export type DataScope = {
    name: string;
    label?: string;
    source?: string;
    fields: DataField[];
};
