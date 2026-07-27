import { findUsedBlocTags, ContentValidationError, type BlocRecord, type SiteBlocSnapshot } from "@bernouy/cms-content";

export function validateSiteBlocDependencies(
    records: BlocRecord[],
    ownerTag: string,
    snapshot: SiteBlocSnapshot,
): void {
    const published = new Map(records.filter((record) => record.artifact).map((record) => [record.tag, record]));
    for (const dependency of snapshot.dependencies) {
        const record = published.get(dependency);
        if (!record) {
            throw new ContentValidationError("draft.structure", `bloc "${dependency}" is not published`);
        }
        if (record.siteDefinition?.lifecycle === "archived") {
            throw new ContentValidationError("draft.structure", `bloc "${dependency}" is archived`);
        }
    }

    const graph = siteBlocDependencyGraph(records);
    graph.set(ownerTag, new Set(snapshot.dependencies));
    const cycle = findCycle(graph, ownerTag);
    if (cycle) {
        throw new ContentValidationError("draft.structure", `dependency cycle detected: ${cycle.join(" -> ")}`);
    }
}

export function siteBlocDependencyGraph(records: BlocRecord[]): Map<string, Set<string>> {
    const published = records.filter((record) => record.artifact);
    const known = published.map((record) => ({ id: record.tag }));
    return new Map(
        published.map((record) => {
            const declared = record.siteDefinition?.published?.dependencies;
            const inferred = declared ?? findUsedBlocTags(record.artifact?.viewJS ?? "", known);
            return [record.tag, new Set(inferred.filter((tag) => tag !== record.tag))];
        }),
    );
}

export function transitiveDependencies(graph: Map<string, Set<string>>, tag: string): string[] {
    const result = new Set<string>();
    const visit = (current: string): void => {
        for (const dependency of graph.get(current) ?? []) {
            if (dependency === tag || result.has(dependency)) {
                continue;
            }
            result.add(dependency);
            visit(dependency);
        }
    };
    visit(tag);
    return [...result].sort();
}

function findCycle(graph: Map<string, Set<string>>, start: string): string[] | null {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const path: string[] = [];
    const visit = (tag: string): string[] | null => {
        if (visiting.has(tag)) {
            const index = path.indexOf(tag);
            return [...path.slice(index), tag];
        }
        if (visited.has(tag)) {
            return null;
        }
        visiting.add(tag);
        path.push(tag);
        for (const dependency of graph.get(tag) ?? []) {
            const cycle = visit(dependency);
            if (cycle) {
                return cycle;
            }
        }
        path.pop();
        visiting.delete(tag);
        visited.add(tag);
        return null;
    };
    return visit(start);
}
