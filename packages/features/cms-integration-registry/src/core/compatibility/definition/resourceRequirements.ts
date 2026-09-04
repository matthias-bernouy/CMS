import { integrationVersionRangeContainsRange, type CollectionResourceRequirements } from "@bernouy/cms-integrations";
import type { CompatibilityChangeSink } from "../changes";

export function compareCollectionResourceRequirements(
    baseline: CollectionResourceRequirements | undefined,
    candidate: CollectionResourceRequirements | undefined,
    path: string,
    add: CompatibilityChangeSink,
): void {
    compareResourceIds(baseline?.resources, candidate?.resources, `${path}.resources`, add);
    const previous = new Map((baseline?.collections ?? []).map((requirement) => [requirement.kind, requirement]));
    const next = new Map((candidate?.collections ?? []).map((requirement) => [requirement.kind, requirement]));
    for (const [kind, requirement] of previous) {
        const nextRequirement = next.get(kind);
        const requirementPath = `${path}.collections.${kind}`;
        if (!nextRequirement) {
            add("additive", "definition", "collection-requirement-removed", requirementPath, "Requirement removed");
            continue;
        }
        compareRange(requirement.versionRange, nextRequirement.versionRange, requirementPath, add);
        compareResourceIds(requirement.resources, nextRequirement.resources, `${requirementPath}.resources`, add);
    }
    for (const [kind] of next) {
        if (!previous.has(kind)) {
            add(
                "breaking",
                "definition",
                "collection-requirement-added",
                `${path}.collections.${kind}`,
                "Collection requirement added to an existing resource",
            );
        }
    }
}

function compareResourceIds(
    baseline: readonly string[] | undefined,
    candidate: readonly string[] | undefined,
    path: string,
    add: CompatibilityChangeSink,
): void {
    const previous = new Set(baseline ?? []);
    const next = new Set(candidate ?? []);
    for (const id of previous) {
        if (!next.has(id)) {
            add(
                "additive",
                "definition",
                "collection-required-resource-removed",
                `${path}.${id}`,
                "Requirement removed",
            );
        }
    }
    for (const id of next) {
        if (!previous.has(id)) {
            add(
                "breaking",
                "definition",
                "collection-required-resource-added",
                `${path}.${id}`,
                "Resource requirement added to an existing resource",
            );
        }
    }
}

function compareRange(baseline: string, candidate: string, path: string, add: CompatibilityChangeSink): void {
    if (baseline === candidate) {
        return;
    }
    if (integrationVersionRangeContainsRange(candidate, baseline)) {
        add("additive", "definition", "collection-requirement-range-widened", path, "Collection range widened");
        return;
    }
    add("breaking", "definition", "collection-requirement-range-narrowed", path, "Collection range narrowed");
}
