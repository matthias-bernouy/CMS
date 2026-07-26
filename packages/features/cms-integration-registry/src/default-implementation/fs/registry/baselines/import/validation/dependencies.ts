import { integrationVersionSatisfies, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { ReviewedSchemaBaselineImportError } from "../../../../../../core/baselines/errors";
import type { IntegrationRegistryCatalogSnapshot } from "../../../../../../interfaces/catalog";
import type { ReviewedSchemaBaselineImportRequest } from "../../../../../../interfaces/reportStore";

export function validateReviewedSchemaBaselineDependencies(
    dependencies: ReviewedSchemaBaselineImportRequest["baseline"]["dependencies"],
    definition: IntegrationDefinition,
    snapshot: IntegrationRegistryCatalogSnapshot,
): void {
    const pins = new Map<string, (typeof dependencies)[number]>();
    for (const dependency of dependencies) {
        if (pins.has(dependency.kind)) {
            throw unapproved("Reviewed schema baseline dependencies contain duplicate kinds");
        }
        pins.set(dependency.kind, dependency);
    }
    const visited = new Set<string>();
    visitDependencies(definition, snapshot, pins, visited, new Set());
    if (visited.size !== pins.size) {
        throw unapproved("Reviewed schema baseline dependencies contain entries outside the required package graph");
    }
}

function visitDependencies(
    definition: IntegrationDefinition,
    snapshot: IntegrationRegistryCatalogSnapshot,
    pins: ReadonlyMap<string, Readonly<{ kind: string; version: string; packageDigest: string }>>,
    visited: Set<string>,
    visiting: Set<string>,
): void {
    for (const dependency of [...(definition.dependencies ?? [])]
        .filter(({ optional }) => !optional)
        .sort((left, right) => compareText(left.kind, right.kind))) {
        const pin = pins.get(dependency.kind);
        const location = pin ? snapshot.locateExactVersion(pin.kind, pin.version) : null;
        if (
            !pin ||
            !location ||
            location.package.digest !== pin.packageDigest ||
            (dependency.versionRange && !integrationVersionSatisfies(pin.version, dependency.versionRange))
        ) {
            throw unapproved(
                `Reviewed schema baseline dependency cannot be resolved: ${definition.kind} -> ${dependency.kind}`,
            );
        }
        if (visited.has(pin.kind)) {
            continue;
        }
        if (visiting.has(pin.kind)) {
            throw unapproved(`Reviewed schema baseline dependency graph contains a cycle at ${pin.kind}`);
        }
        visiting.add(pin.kind);
        visitDependencies(location.definitionSnapshot, snapshot, pins, visited, visiting);
        visiting.delete(pin.kind);
        visited.add(pin.kind);
    }
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function unapproved(message: string): ReviewedSchemaBaselineImportError {
    return new ReviewedSchemaBaselineImportError(422, "reviewed_schema_baseline_import_unapproved", message);
}
