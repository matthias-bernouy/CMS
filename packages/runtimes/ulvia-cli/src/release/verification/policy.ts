import { lt } from "semver";
import type { LocalCompatibilityResult } from "../compatibility";
import type { LocalReleasePackage } from "../types";
import { assertPublishedMigrationHistory } from "./publishedMigrations";

export function assertSafeMigrationReleasePolicy(
    candidate: LocalReleasePackage,
    compatibility: LocalCompatibilityResult,
    baselines: readonly LocalReleasePackage[] = [],
): void {
    assertStatefulChangesUseMigration(candidate, compatibility);
    assertPublishedMigrationHistory(candidate, baselines);
    assertExpandContractSeparation(candidate);
}

function assertStatefulChangesUseMigration(
    candidate: LocalReleasePackage,
    compatibility: LocalCompatibilityResult,
): void {
    const stateful = compatibility.evidence.filter(requiresStagedMigration);
    for (const finding of stateful) {
        const connector = (candidate.definition.connectors ?? []).find((entry) =>
            finding.path.startsWith(`connectors.${connectorIdentity(entry)}.`),
        );
        if (!connector?.migration) {
            throw new Error(
                `Unsafe ${finding.surface} change at ${finding.path} requires a migration-aware connector; ` +
                    "a major version alone does not make an in-place upgrade safe",
            );
        }
    }
}

function requiresStagedMigration(entry: LocalCompatibilityResult["evidence"][number]): boolean {
    if (entry.surface === "schema") {
        return entry.classification !== "compatible";
    }
    if (entry.surface !== "function") {
        return false;
    }
    return (
        entry.code === "function-implementation-changed" ||
        entry.classification === "breaking" ||
        entry.classification === "unknown"
    );
}

function assertExpandContractSeparation(candidate: LocalReleasePackage): void {
    const version = candidate.package.envelope.version;
    for (const connector of candidate.definition.connectors ?? []) {
        const migrations = connector.migration?.migrations ?? [];
        const introduced = migrations.filter((migration) => migration.introducedIn === version);
        const phases = new Set(introduced.map((migration) => migration.phase));
        if (phases.has("expand") && phases.has("contract")) {
            throw new Error(
                `Connector "${connector.connectorKey ?? connector.provider}" introduces expand and contract ` +
                    `migrations in ${version}; destructive contraction must ship in a later release`,
            );
        }
        for (const contract of introduced.filter((migration) => migration.phase === "contract")) {
            const priorExpansion = migrations.some(
                (migration) =>
                    migration.phase === "expand" &&
                    migration.toRevision === contract.fromRevision &&
                    lt(migration.introducedIn, version),
            );
            if (!priorExpansion) {
                throw new Error(
                    `Contract migration "${contract.id}" has no expansion from an earlier release at revision ` +
                        `${contract.fromRevision}`,
                );
            }
        }
    }
}

function connectorIdentity(connector: { provider: string; root?: string }): string {
    return `${connector.provider}:${connector.root ?? "."}`;
}
