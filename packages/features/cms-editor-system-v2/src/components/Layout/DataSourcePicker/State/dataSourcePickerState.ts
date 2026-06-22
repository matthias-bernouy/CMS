import type { EditorDataSource } from "../../../runtime";
import type { DataSourcePickerSourceBinding } from "../Binding/dataSourceBinding";
import { filteredSources, providerGroups } from "./dataSourceGroups";

export function cloneSources(sources: EditorDataSource[]): EditorDataSource[] {
    return sources.map(source => ({
        ...source,
        fields: [...source.fields],
    }));
}

export function firstProviderKey(sources: EditorDataSource[], query: string): string {
    return providerGroups(filteredSources(sources, query))[0]?.key ?? "";
}

export function visibleSources(sources: EditorDataSource[], query: string, activeProvider: string): EditorDataSource[] {
    return filteredSources(sources, query).filter(source => (source.provider ?? "default") === activeProvider);
}

export function initialAlias(binding: DataSourcePickerSourceBinding | null): string {
    return binding?.alias ?? "data";
}
