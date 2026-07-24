import { parseQueryParamToken } from "@bernouy/cms-content/editor";
import type { EditorDataSource } from "../../../../../runtime";
import type { EditorDataSourceMethod } from "../../../../../runtime";

export type DataSourcePickerSourceParamValue =
    | { from: "queryParam"; name: string }
    | { from: "state"; name: string }
    | { from: "raw"; value: string | number | boolean };

export type DataSourcePickerSourceBinding = {
    url: string;
    alias?: string;
    method?: EditorDataSourceMethod;
    params?: Record<string, DataSourcePickerSourceParamValue>;
    body?: Record<string, DataSourcePickerSourceParamValue>;
    trigger?: "auto" | "submit" | "change";
};

export function sourceForBinding(
    sources: EditorDataSource[],
    binding: DataSourcePickerSourceBinding | null,
): EditorDataSource | null {
    if (!binding) {
        return null;
    }
    return sources.find((source) => sourceMatchesBinding(source, binding)) ?? null;
}

export function sourceMatchesBinding(source: EditorDataSource, binding: DataSourcePickerSourceBinding): boolean {
    if (binding.method && (source.method ?? "GET") !== binding.method) {
        return false;
    }
    return bindingQuery(source.url, binding.url) !== null;
}

export function paramsForBinding(
    source: EditorDataSource,
    binding: DataSourcePickerSourceBinding | null,
): Record<string, DataSourcePickerSourceParamValue> {
    if (!binding) {
        return {};
    }
    if (binding.params) {
        return binding.params;
    }

    const query = bindingQuery(source.url, binding.url);
    if (!query) {
        return {};
    }

    const params: Record<string, DataSourcePickerSourceParamValue> = {};
    for (const [name, value] of new URLSearchParams(query).entries()) {
        params[name] = paramValue(value);
    }
    return params;
}

function paramValue(value: string): DataSourcePickerSourceParamValue {
    const queryParam = parseQueryParamToken(value);
    if (queryParam) {
        return { from: "queryParam", name: queryParam };
    }
    const state = tokenValue(value, "@");
    if (state) {
        return { from: "state", name: state };
    }
    return { from: "raw", value };
}

function tokenValue(value: string, prefix: "#" | "@"): string | null {
    const match = new RegExp(`^\\${prefix}\\{([^}]+)\\}$`).exec(value);
    return match?.[1]?.trim() || null;
}

function bindingQuery(sourceUrl: string, bindingUrl: string): string | null {
    if (bindingUrl === sourceUrl) {
        return "";
    }
    if (bindingUrl.startsWith(`${sourceUrl}?`)) {
        return bindingUrl.slice(sourceUrl.length + 1);
    }
    if (sourceUrl.includes("?") && bindingUrl.startsWith(`${sourceUrl}&`)) {
        return bindingUrl.slice(sourceUrl.length + 1);
    }
    return null;
}
