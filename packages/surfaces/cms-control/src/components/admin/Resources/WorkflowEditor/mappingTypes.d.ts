export type MappingShape = {
    type: "string" | "number" | "boolean" | "object" | "array";
    properties?: Record<string, MappingShape>;
    items?: MappingShape;
    required?: string[];
    semantic?: {
        kind: "user-id";
        authority?: string;
    };
};

export type ReferenceOption = {
    value: string;
    label: string;
    shape?: MappingShape;
};

export type MappingTarget = {
    path: string;
    label: string;
    required?: boolean;
    shape?: MappingShape;
};

export type ValueDraft = {
    mode: "reference" | "literal";
    value: string;
};
