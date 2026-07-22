import type { EditorDataSource, EditorDataSourceBodyField } from "../../../../../runtime";
import type { DataSourcePickerSourceBinding } from "../Binding/dataSourceBinding";
import { filteredSources, providerGroups } from "./dataSourceGroups";

export function cloneSources(sources: EditorDataSource[]): EditorDataSource[] {
    return sources.map((source) => ({
        ...source,
        params: source.params?.map((param) => ({ ...param })),
        body: source.body ? { ...source.body, fields: cloneBodyFields(source.body.fields) } : undefined,
        fields: [...source.fields],
    }));
}

function cloneBodyFields(fields: EditorDataSourceBodyField[]): EditorDataSourceBodyField[] {
    return fields.map((field) => ({
        ...field,
        children: field.children ? cloneBodyFields(field.children) : undefined,
    }));
}

export function firstProviderKey(sources: EditorDataSource[], query: string): string {
    return providerGroups(filteredSources(sources, query))[0]?.key ?? "";
}

export function visibleSources(sources: EditorDataSource[], query: string, activeProvider: string): EditorDataSource[] {
    return filteredSources(sources, query).filter((source) => (source.provider ?? "default") === activeProvider);
}

export function initialAlias(binding: DataSourcePickerSourceBinding | null): string {
    return binding?.alias ?? "data";
}
