import type { DataField, EndpointPickerMethod } from "@bernouy/cms-content/editor";

export type EditorDataSourceMethod = EndpointPickerMethod;

export type EditorDataSourceParam = {
    name: string;
    in: "path" | "query" | "header";
    required?: boolean;
    type?: string;
    description?: string;
};

export type EditorDataSourceBodyField = {
    path: string;
    type?: string;
    required?: boolean;
    children?: EditorDataSourceBodyField[];
};

export type EditorDataSourceBody = {
    contentType: "application/json";
    fields: EditorDataSourceBodyField[];
};

export type EditorDataSource = {
    label: string;
    url: string;
    method?: EditorDataSourceMethod;
    provider?: string;
    providerUrn?: string;
    endpointUrn?: string;
    providerLabel?: string;
    description?: string;
    params?: EditorDataSourceParam[];
    body?: EditorDataSourceBody;
    fields: DataField[];
};
