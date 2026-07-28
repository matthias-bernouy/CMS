import {
    integrationVersionSatisfies,
    isIntegrationDefinitionVersionInstallable,
    type IntegrationDefinition,
    type IntegrationDefinitionIndex,
} from "@bernouy/cms-integrations";
import type { AdmissionDependencyReferenceV1 } from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCatalogSnapshot } from "cms-integration-registry/interfaces/catalog";
import { FsIntegrationRegistryCandidateAdmissionPlanningError } from "./types";

export function resolveCandidateDependencies(
    snapshot: IntegrationRegistryCatalogSnapshot,
    definition: IntegrationDefinition,
): readonly AdmissionDependencyReferenceV1[] {
    const resolved = new Map<string, AdmissionDependencyReferenceV1>();
    const visiting = new Set<string>();
    visitDependencies(snapshot, definition, resolved, visiting);
    return Object.freeze([...resolved.values()]);
}

function visitDependencies(
    snapshot: IntegrationRegistryCatalogSnapshot,
    definition: IntegrationDefinition,
    resolved: Map<string, AdmissionDependencyReferenceV1>,
    visiting: Set<string>,
): void {
    for (const dependency of [...(definition.dependencies ?? [])].toSorted((left, right) =>
        compareText(left.kind, right.kind),
    )) {
        const index = snapshot.getIndex(dependency.kind);
        const selected = (["minimum", "stable"] as const).map((selection) => ({
            selection,
            version: selectDependency(index, dependency.versionRange, selection),
        }));
        if (selected.some((entry) => !entry.version)) {
            if (dependency.optional) {
                continue;
            }
            throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
                "dependency_unavailable",
                `Required dependency ${dependency.kind}${dependency.versionRange ? ` ${dependency.versionRange}` : ""} has no exact minimum and stable resolution`,
            );
        }
        for (const entry of selected) {
            visitDependency(snapshot, dependency.kind, entry.version!, entry.selection, resolved, visiting);
        }
    }
}

function visitDependency(
    snapshot: IntegrationRegistryCatalogSnapshot,
    kind: string,
    version: string,
    selection: NonNullable<AdmissionDependencyReferenceV1["selection"]>,
    resolved: Map<string, AdmissionDependencyReferenceV1>,
    visiting: Set<string>,
): void {
    const identity = `${selection}:${kind}@${version}`;
    if (visiting.has(identity)) {
        throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
            "dependency_cycle",
            `Required dependency cycle includes ${identity}`,
        );
    }
    const location = snapshot.locateExactVersion(kind, version);
    if (!location) {
        throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
            "dependency_unavailable",
            `Dependency ${identity} disappeared from the captured catalog`,
        );
    }
    const reference = { selection, kind, version, packageDigest: location.package.digest };
    const key = `${selection}:${kind}`;
    const existing = resolved.get(key);
    if (existing && existing.packageDigest !== reference.packageDigest) {
        throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
            "dependency_unavailable",
            `Dependency graph selects conflicting ${selection} versions of ${kind}`,
        );
    }
    if (existing) {
        return;
    }
    visiting.add(identity);
    visitSelectedDependencies(snapshot, location.definitionSnapshot, selection, resolved, visiting);
    visiting.delete(identity);
    resolved.set(key, reference);
}

function visitSelectedDependencies(
    snapshot: IntegrationRegistryCatalogSnapshot,
    definition: IntegrationDefinition,
    selection: NonNullable<AdmissionDependencyReferenceV1["selection"]>,
    resolved: Map<string, AdmissionDependencyReferenceV1>,
    visiting: Set<string>,
): void {
    for (const dependency of [...(definition.dependencies ?? [])].toSorted((left, right) =>
        compareText(left.kind, right.kind),
    )) {
        const version = selectDependency(snapshot.getIndex(dependency.kind), dependency.versionRange, selection);
        if (!version) {
            if (dependency.optional) {
                continue;
            }
            throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
                "dependency_unavailable",
                `Required transitive dependency ${dependency.kind}${dependency.versionRange ? ` ${dependency.versionRange}` : ""} has no ${selection} resolution`,
            );
        }
        visitDependency(snapshot, dependency.kind, version, selection, resolved, visiting);
    }
}

function selectDependency(
    index: IntegrationDefinitionIndex | null,
    range: string | undefined,
    selection: NonNullable<AdmissionDependencyReferenceV1["selection"]>,
): string | null {
    if (!index) {
        return null;
    }
    const candidates =
        selection === "stable" ? index.versions.filter((entry) => entry.version === index.stable) : index.versions;
    return (
        candidates.find(
            (entry) =>
                isIntegrationDefinitionVersionInstallable(entry) &&
                (!range || integrationVersionSatisfies(entry.version, range)),
        )?.version ?? null
    );
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
