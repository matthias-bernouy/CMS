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
        const dependencies = (source.definition.dependencies ?? [])
            .filter((dependency) => !dependency.optional && sourceSatisfies(dependency, sources.get(dependency.kind)))
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
