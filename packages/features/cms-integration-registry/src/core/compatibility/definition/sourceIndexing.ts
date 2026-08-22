import { isDeepStrictEqual } from "node:util";
import type { DeclarativeArtifactTemplate } from "@bernouy/cms-integrations";
import type { CompatibilityChangeSink } from "../changes";

type Source = Extract<DeclarativeArtifactTemplate, { type: "source" }>["source"];
type SourceIndexingEntity = NonNullable<Source["indexing"]>["entities"][number];

export function compareSourceIndexing(
    baseline: Source["indexing"],
    candidate: Source["indexing"],
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (!baseline && !candidate) {
        return;
    }
    if (!baseline && candidate) {
        add("additive", "artifact", "source-indexing-added", path, "Source indexing capability was added");
        return;
    }
    if (baseline && !candidate) {
        add("breaking", "artifact", "source-indexing-removed", path, "Source indexing capability was removed");
        return;
    }
    const previous = new Map(baseline!.entities.map((entity) => [entity.id, entity]));
    const next = new Map(candidate!.entities.map((entity) => [entity.id, entity]));
    for (const [id, entity] of previous) {
        const candidateEntity = next.get(id);
        if (!candidateEntity) {
            add("breaking", "artifact", "indexing-entity-removed", `${path}.${id}`, "Indexing entity was removed");
        } else {
            compareIndexingEntity(entity, candidateEntity, `${path}.${id}`, add);
        }
    }
    for (const [id] of next) {
        if (!previous.has(id)) {
            add("additive", "artifact", "indexing-entity-added", `${path}.${id}`, "Indexing entity was added");
        }
    }
}

function compareIndexingEntity(
    baseline: SourceIndexingEntity,
    candidate: SourceIndexingEntity,
    path: string,
    add: CompatibilityChangeSink,
): void {
    const { variables: previousVariables, ...previousContract } = baseline;
    const { variables: nextVariables, ...nextContract } = candidate;
    if (!isDeepStrictEqual(previousContract, nextContract)) {
        add(
            "unknown",
            "artifact",
            "indexing-entity-contract-changed",
            path,
            "Indexing entity resolution, discovery, or defaults changed",
        );
    }
    compareVariables(previousVariables, nextVariables, `${path}.variables`, add);
}

function compareVariables(
    baseline: SourceIndexingEntity["variables"],
    candidate: SourceIndexingEntity["variables"],
    path: string,
    add: CompatibilityChangeSink,
): void {
    const previous = new Map(Object.entries(baseline));
    const next = new Map(Object.entries(candidate));
    for (const [name, variable] of previous) {
        const candidateVariable = next.get(name);
        if (!candidateVariable) {
            add(
                "breaking",
                "artifact",
                "indexing-variable-removed",
                `${path}.${name}`,
                "Indexing variable was removed",
            );
        } else if (!isDeepStrictEqual(variable, candidateVariable)) {
            add(
                "breaking",
                "artifact",
                "indexing-variable-changed",
                `${path}.${name}`,
                "Indexing variable path or type changed",
            );
        }
    }
    for (const [name] of next) {
        if (!previous.has(name)) {
            add("additive", "artifact", "indexing-variable-added", `${path}.${name}`, "Indexing variable was added");
        }
    }
}
