import { integrationVersionSatisfies } from "@bernouy/cms-integrations";
import { readLocalReleaseSource } from ".";

export async function orderLocalReleaseKinds(root: string, kinds: readonly string[]): Promise<readonly string[]> {
    const sources = new Map(
        await Promise.all(kinds.map(async (kind) => [kind, await readLocalReleaseSource(root, kind)] as const)),
    );
    const ordered: string[] = [];
    const complete = new Set<string>();
    const visiting: string[] = [];

    const visit = (kind: string): void => {
        if (complete.has(kind)) {
            return;
        }
        const cycleAt = visiting.indexOf(kind);
        if (cycleAt >= 0) {
            throw new Error(
                `Local integration dependency cycle includes ${[...visiting.slice(cycleAt), kind].join(" → ")}`,
            );
        }
        visiting.push(kind);
        const source = sources.get(kind)!;
        const dependencies = authorDependencies(source.definition)
            .filter((dependency) => sourceSatisfies(dependency, sources.get(dependency.kind)))
            .map((dependency) => dependency.kind)
            .sort((left, right) => left.localeCompare(right));
        for (const dependency of dependencies) {
            visit(dependency);
        }
        visiting.pop();
        complete.add(kind);
        ordered.push(kind);
    };

    for (const kind of kinds) {
        visit(kind);
    }
    return ordered;
}

function authorDependencies(
    definition: Awaited<ReturnType<typeof readLocalReleaseSource>>["definition"],
): Array<{ kind: string; versionRange?: string }> {
    const declared = (definition.dependencies ?? []).filter((dependency) => !dependency.optional);
    if (definition.schema !== "cms.integration.definition.v2" || definition.type !== "collection") {
        return declared;
    }
    const resourceDependencies = definition.resources.flatMap((resource) => [
        ...(resource.endpoints ?? []).map((endpoint) => ({
            kind: endpoint.source,
            versionRange: endpoint.sourceVersion,
        })),
        ...(resource.requires?.collections ?? []).map(({ kind, versionRange }) => ({ kind, versionRange })),
    ]);
    return [...declared, ...(definition.theme?.dependencies ?? []), ...resourceDependencies];
}

function sourceSatisfies(
    dependency: { versionRange?: string },
    source: Awaited<ReturnType<typeof readLocalReleaseSource>> | undefined,
): boolean {
    if (!source) {
        return false;
    }
    return (
        !dependency.versionRange ||
        integrationVersionSatisfies(source.package.envelope.version, dependency.versionRange)
    );
}
