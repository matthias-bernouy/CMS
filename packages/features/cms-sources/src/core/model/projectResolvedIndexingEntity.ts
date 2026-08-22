import type { SourceIndexingEntity } from "cms-sources/interfaces/SourceIndexing";
import { dataValueAtPath } from "cms-sources/core/validation/parseDataShape";

export type ProjectedIndexingEntity = {
    identity: string | number;
    variables: Record<string, string | number>;
};

/** Project one resolved source response through its declared indexing contract. */
export function projectResolvedIndexingEntity(
    entity: SourceIndexingEntity,
    response: unknown,
): ProjectedIndexingEntity | null {
    const identity = scalarAtPath(response, entity.resolve.identity.outputPath);
    if (identity === undefined) {
        return null;
    }

    const variables: Record<string, string | number> = {};
    for (const [name, variable] of Object.entries(entity.variables)) {
        const value = scalarAtPath(response, variable.path);
        if (
            (variable.type === "number" && typeof value === "number") ||
            (variable.type !== "number" && typeof value === "string")
        ) {
            variables[name] = value;
        }
    }
    return { identity, variables };
}

function scalarAtPath(value: unknown, path: string): string | number | undefined {
    const current = dataValueAtPath(value, path);
    if (typeof current === "string") {
        return current;
    }
    if (typeof current === "number" && Number.isFinite(current)) {
        return current;
    }
    return undefined;
}
