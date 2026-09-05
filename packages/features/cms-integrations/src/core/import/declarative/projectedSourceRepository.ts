import { readPersistedSource, type Source, type SourceEndpoint, type SourceRepository } from "@bernouy/cms-sources";

export function projectTargetSources(
    repository: SourceRepository,
    targets: Source[],
    hiddenSourceIds: ReadonlySet<string> = new Set(),
): SourceRepository {
    const byUrn = new Map(targets.map((source) => [source.urn, source]));
    const endpoints = new Map(
        targets.flatMap((source) => source.endpoints.map((endpoint) => [endpoint.urn, endpoint])),
    );
    let hiddenEndpointIds: Promise<ReadonlySet<string>> | undefined;
    const hiddenEndpoints = () =>
        (hiddenEndpointIds ??= Promise.all(
            [...hiddenSourceIds].map(async (urn) => await repository.getSource(urn)),
        ).then(
            (sources) => new Set(sources.flatMap((source) => source?.endpoints.map((endpoint) => endpoint.urn) ?? [])),
        ));
    return {
        createSource: (source) => repository.createSource(source),
        updateSource: (source) => repository.updateSource(source),
        deleteSource: (urn) => repository.deleteSource(urn),
        getSource: async (urn) =>
            clone(byUrn.get(urn)) ?? (hiddenSourceIds.has(urn) ? null : await repository.getSource(urn)),
        getPersistedSource: async (urn) => await readPersistedSource(repository, urn),
        getAllSources: async () => mergeSources(await repository.getAllSources(), byUrn, hiddenSourceIds),
        getEndpoint: async (urn) =>
            clone(endpoints.get(urn)) ??
            ((await hiddenEndpoints()).has(urn) ? null : await repository.getEndpoint(urn)),
        ...(repository.getEndpointForAuthorization
            ? {
                  getEndpointForAuthorization: async (urn: string) =>
                      clone(endpoints.get(urn)) ??
                      ((await hiddenEndpoints()).has(urn) ? null : await repository.getEndpointForAuthorization!(urn)),
              }
            : {}),
        ...(repository.invalidateSchema ? { invalidateSchema: (scope) => repository.invalidateSchema!(scope) } : {}),
    };
}

function mergeSources(
    existing: Source[],
    targets: Map<string, Source>,
    hiddenSourceIds: ReadonlySet<string>,
): Source[] {
    const merged = new Map(
        existing.filter((source) => !hiddenSourceIds.has(source.urn)).map((source) => [source.urn, source]),
    );
    for (const [urn, source] of targets) {
        merged.set(urn, source);
    }
    return [...merged.values()].map((source) => structuredClone(source));
}

function clone<T extends Source | SourceEndpoint>(value: T | undefined): T | null {
    return value ? structuredClone(value) : null;
}
