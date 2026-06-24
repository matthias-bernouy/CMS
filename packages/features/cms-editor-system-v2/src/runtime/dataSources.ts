import type { DataField } from "@bernouy/cms-content/editor";

export type EditorDataSourceMethod =
    | "GET"
    | "POST"
    | "PUT"
    | "DELETE"
    | "PATCH"
    | "HEAD"
    | "OPTIONS";

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
    providerLabel?: string;
    description?: string;
    params?: EditorDataSourceParam[];
    body?: EditorDataSourceBody;
    fields: DataField[];
};
