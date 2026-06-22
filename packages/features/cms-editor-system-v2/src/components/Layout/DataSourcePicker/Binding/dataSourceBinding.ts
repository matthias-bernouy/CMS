import type { EditorDataSource } from "../../../runtime";

export type DataSourcePickerSourceParamValue =
    | { from: "queryParam"; name: string }
    | { from: "raw"; value: string };

export type DataSourcePickerSourceBinding = {
    url: string;
    alias?: string;
    params?: Record<string, DataSourcePickerSourceParamValue>;
};

export function sourceForBinding(
    sources: EditorDataSource[],
    binding: DataSourcePickerSourceBinding | null,
): EditorDataSource | null {
    if (!binding) return null;
    return sources.find(source => sourceMatchesBinding(source, binding)) ?? null;
}

export function sourceMatchesBinding(source: EditorDataSource, binding: DataSourcePickerSourceBinding): boolean {
    return bindingQuery(source.url, binding.url) !== null;
}

export function paramsForBinding(
    source: EditorDataSource,
    binding: DataSourcePickerSourceBinding | null,
): Record<string, DataSourcePickerSourceParamValue> {
    if (!binding) return {};
    if (binding.params) return binding.params;

    const query = bindingQuery(source.url, binding.url);
    if (!query) return {};

    const params: Record<string, DataSourcePickerSourceParamValue> = {};
    for (const [name, value] of new URLSearchParams(query).entries()) {
        params[name] = paramValue(value);
    }
    return params;
}

function paramValue(value: string): DataSourcePickerSourceParamValue {
    const match = /^#\{([^}]+)\}$/.exec(value);
    if (match?.[1]?.trim()) {
        return { from: "queryParam", name: match[1].trim() };
    }
    return { from: "raw", value };
}

function bindingQuery(sourceUrl: string, bindingUrl: string): string | null {
    if (bindingUrl === sourceUrl) return "";
    if (bindingUrl.startsWith(`${sourceUrl}?`)) return bindingUrl.slice(sourceUrl.length + 1);
    if (sourceUrl.includes("?") && bindingUrl.startsWith(`${sourceUrl}&`)) {
        return bindingUrl.slice(sourceUrl.length + 1);
    }
    return null;
}
