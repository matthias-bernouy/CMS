import type { EditorDataSource } from "../../../../../../runtime";

export type SourceBinding = {
    url: string;
    alias?: string;
    method?: EditorDataSource["method"];
    params?: Record<string, unknown>;
    body?: Record<string, unknown>;
    trigger?: "auto" | "submit" | "change";
};
