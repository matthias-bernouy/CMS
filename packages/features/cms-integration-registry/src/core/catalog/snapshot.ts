import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import type {
    CreateIntegrationRegistryCatalogSnapshotInput,
    IntegrationRegistryCatalogSnapshot,
    IntegrationRegistryExactVersionLocation,
} from "../../interfaces/catalog";
import { immutableClone } from "./immutability";

const builtSnapshots = new WeakSet<object>();

export function createIntegrationRegistryCatalogSnapshot(
    input: CreateIntegrationRegistryCatalogSnapshotInput,
): IntegrationRegistryCatalogSnapshot {
    const diagnostics = immutableClone([...(input.diagnostics ?? [])]);
    const quarantined = immutableClone([...(input.quarantined ?? [])]);
    const indexes = new Map<string, IntegrationDefinitionIndex>();
    const locations = new Map<string, IntegrationRegistryExactVersionLocation>();

    for (const entry of [...input.entries].sort((left, right) => left.index.kind.localeCompare(right.index.kind))) {
        const index = immutableClone(entry.index);
        if (indexes.has(index.kind)) {
            throw new Error(`Duplicate integration kind "${index.kind}" in validated catalog entries`);
        }
        const expectedVersions = new Set(index.versions.map((version) => version.version));
        for (const locationValue of entry.versions) {
            const location = immutableClone(locationValue);
            if (location.kind !== index.kind || !expectedVersions.delete(location.version)) {
                throw new Error(`Unexpected exact version location "${location.kind}@${location.version}"`);
            }
            const identity = versionIdentity(location.kind, location.version);
            if (locations.has(identity)) {
                throw new Error(`Duplicate exact version location "${location.kind}@${location.version}"`);
            }
            locations.set(identity, location);
        }
        if (expectedVersions.size > 0) {
            throw new Error(`Missing exact version locations for integration "${index.kind}"`);
        }
        indexes.set(index.kind, index);
    }

    const summaries = immutableClone(
        [...indexes.values()].map((index) => ({
            kind: index.kind,
            label: index.label,
            ...(index.schema ? { schema: index.schema } : {}),
            ...(index.icon ? { icon: index.icon } : {}),
            ...(index.category ? { category: index.category } : {}),
            ...(index.description ? { description: index.description } : {}),
            ...(index.stable ? { stable: index.stable } : {}),
            ...(index.latest ? { latest: index.latest } : {}),
            versions: index.versions.map((version) => version.version),
        })),
    );
    const snapshot: IntegrationRegistryCatalogSnapshot = Object.freeze({
        health: diagnostics.length === 0 ? "healthy" : "degraded",
        summaries,
        diagnostics,
        quarantined,
        getIndex(kind) {
            return indexes.get(kind) ?? null;
        },
        listVersions(kind) {
            return indexes.get(kind)?.versions ?? [];
        },
        locateExactVersion(kind, version) {
            return locations.get(versionIdentity(kind, version)) ?? null;
        },
    });
    builtSnapshots.add(snapshot);
    return snapshot;
}

export function assertBuiltIntegrationRegistryCatalogSnapshot(snapshot: IntegrationRegistryCatalogSnapshot): void {
    if (!builtSnapshots.has(snapshot)) {
        throw new TypeError("Catalog snapshot must be created by createIntegrationRegistryCatalogSnapshot");
    }
}

function versionIdentity(kind: string, version: string): string {
    return `${kind}\0${version}`;
}
