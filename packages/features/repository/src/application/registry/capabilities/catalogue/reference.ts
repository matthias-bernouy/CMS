import type { RepositoryResourceReference } from "repository/repository/search/interfaces";
export function establishedReference(value: RepositoryResourceReference) {
    const kind = value.kind;
    if (kind === "workflow") {
        throw new Error("Workflow references require the artifact discovery capability");
    }
    return { ...value, kind };
}
