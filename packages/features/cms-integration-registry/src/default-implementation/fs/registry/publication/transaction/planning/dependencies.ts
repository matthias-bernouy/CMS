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
    return Object.freeze([...resolved.values()].toSorted(compareReference));
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
        const selected = selectDependency(snapshot.getIndex(dependency.kind), dependency.versionRange);
        if (!selected) {
            if (dependency.optional) {
                continue;
            }
            throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
                "dependency_unavailable",
                `Required dependency ${dependency.kind}${dependency.versionRange ? ` ${dependency.versionRange}` : ""} is unavailable`,
            );
        }
        const identity = `${dependency.kind}@${selected.version}`;
        if (visiting.has(identity)) {
            throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
                "dependency_cycle",
                `Required dependency cycle includes ${identity}`,
            );
        }
        const location = snapshot.locateExactVersion(dependency.kind, selected.version);
        if (!location) {
            throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
                "dependency_unavailable",
                `Dependency ${identity} disappeared from the captured catalog`,
            );
        }
        const reference = {
            kind: dependency.kind,
            version: selected.version,
            packageDigest: location.package.digest,
        };
        const existing = resolved.get(dependency.kind);
        if (existing && existing.packageDigest !== reference.packageDigest) {
            throw new FsIntegrationRegistryCandidateAdmissionPlanningError(
                "dependency_unavailable",
                `Dependency graph selects conflicting versions of ${dependency.kind}`,
            );
        }
        if (existing) {
            continue;
        }
        visiting.add(identity);
        visitDependencies(snapshot, location.definitionSnapshot, resolved, visiting);
        visiting.delete(identity);
        resolved.set(dependency.kind, reference);
    }
}

function selectDependency(index: IntegrationDefinitionIndex | null, range: string | undefined) {
    if (!index) {
        return null;
    }
    const preferred = [index.stable, index.latest]
        .filter((value): value is string => Boolean(value))
        .map((version) => index.versions.find((entry) => entry.version === version))
        .filter((entry) => entry !== undefined);
    const candidates = [...preferred, ...index.versions.toReversed()];
    return (
        candidates.find(
            (entry) =>
                isIntegrationDefinitionVersionInstallable(entry) &&
                (!range || integrationVersionSatisfies(entry.version, range)),
        ) ?? null
    );
}

function compareReference(left: AdmissionDependencyReferenceV1, right: AdmissionDependencyReferenceV1): number {
    return compareText(`${left.kind}\0${left.version}`, `${right.kind}\0${right.version}`);
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
