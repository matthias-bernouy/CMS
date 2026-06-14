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

export type EditorDataSource = {
    label: string;
    url: string;
    method?: EditorDataSourceMethod;
    provider?: string;
    providerLabel?: string;
    description?: string;
    params?: EditorDataSourceParam[];
    fields: DataField[];
};
