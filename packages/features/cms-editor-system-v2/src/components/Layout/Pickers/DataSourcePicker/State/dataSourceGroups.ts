import type { EditorDataSource } from "../../../../../runtime";

export type DataSourceProviderGroup = {
    key: string;
    label: string;
    count: number;
};

export function filteredSources(sources: EditorDataSource[], query: string): EditorDataSource[] {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
        return sources;
    }

    return sources.filter((source) =>
        [source.label, source.description, source.provider, source.providerLabel, source.url].some((value) =>
            value?.toLowerCase().includes(normalized),
        ),
    );
}

export function providerGroups(sources: EditorDataSource[]): DataSourceProviderGroup[] {
    const groups = new Map<string, DataSourceProviderGroup>();

    for (const source of sources) {
        const key = source.provider ?? "default";
        const current = groups.get(key) ?? {
            key,
            label: source.providerLabel ?? source.provider ?? "Sources",
            count: 0,
        };
        current.count += 1;
        groups.set(key, current);
    }

    return [...groups.values()];
}
