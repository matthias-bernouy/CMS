import type { DataField } from "@bernouy/cms-content/editor";

export type EditorDataSourceMethod =
    | "GET"
    | "POST"
    | "PUT"
    | "DELETE"
    | "PATCH"
    | "HEAD"
    | "OPTIONS";

export type EditorDataSource = {
    label: string;
    url: string;
    method?: EditorDataSourceMethod;
    provider?: string;
    providerLabel?: string;
    description?: string;
    fields: DataField[];
};
