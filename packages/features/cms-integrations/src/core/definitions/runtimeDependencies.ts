import type { IntegrationDefinition } from "../../interfaces/Integration";

export type IntegrationRuntimeDependency = Readonly<{
    kind: string;
    versionRange?: string;
}>;

/**
 * Returns every package that must be installed before the definition can run.
 * Collection contracts declare dependencies through their theme and resources,
 * so those requirements are part of the runtime graph too.
 */
export function integrationRuntimeDependencies(
    definition: IntegrationDefinition,
): readonly IntegrationRuntimeDependency[] {
    const dependencies: IntegrationRuntimeDependency[] = (definition.dependencies ?? [])
        .filter((dependency) => !dependency.optional)
        .map(({ kind, versionRange }) => ({ kind, ...(versionRange ? { versionRange } : {}) }));
    if (definition.schema === "cms.integration.definition.v2" && definition.type === "collection") {
        dependencies.push(...(definition.theme?.dependencies ?? []));
        for (const resource of definition.resources) {
            dependencies.push(
                ...(resource.endpoints ?? []).map(({ source, sourceVersion }) => ({
                    kind: source,
                    versionRange: sourceVersion,
                })),
                ...(resource.requires?.collections ?? []).map(({ kind, versionRange }) => ({
                    kind,
                    versionRange,
                })),
            );
        }
    }
    return Object.freeze(
        [...new Map(dependencies.map((dependency) => [identity(dependency), dependency])).values()].toSorted(
            (left, right) => identity(left).localeCompare(identity(right)),
        ),
    );
}

function identity(dependency: IntegrationRuntimeDependency): string {
    return `${dependency.kind}\0${dependency.versionRange ?? ""}`;
}
