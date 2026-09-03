import { isDeepStrictEqual } from "node:util";
import { lt } from "semver";
import type { LocalReleasePackage } from "../types";

type Connector = NonNullable<LocalReleasePackage["definition"]["connectors"]>[number];
type Migration = NonNullable<Connector["migration"]>["migrations"][number];

export function assertPublishedMigrationHistory(
    candidate: LocalReleasePackage,
    baselines: readonly LocalReleasePackage[],
): void {
    const candidateVersion = candidate.package.envelope.version;
    assertPublishedConnectorsRetained(candidate, baselines);
    for (const connector of candidate.definition.connectors ?? []) {
        if (!connector.migration) {
            continue;
        }
        const published = publishedMigrations(connector, baselines);
        for (const previous of published) {
            const current = connector.migration.migrations.find((migration) => migration.id === previous.id);
            if (!current || !sameMigration(current, previous)) {
                throw new Error(
                    `Connector "${connectorName(connector)}" rewrites or removes published migration "${previous.id}"`,
                );
            }
        }
        for (const migration of connector.migration.migrations) {
            if (
                lt(migration.introducedIn, candidateVersion) &&
                !published.some((entry) => sameMigration(entry, migration))
            ) {
                throw new Error(
                    `Migration "${migration.id}" claims release ${migration.introducedIn}, but no immutable local ` +
                        "baseline contains the same migration",
                );
            }
        }
    }
}

function assertPublishedConnectorsRetained(
    candidate: LocalReleasePackage,
    baselines: readonly LocalReleasePackage[],
): void {
    const current = new Set((candidate.definition.connectors ?? []).map(connectorIdentity));
    for (const baseline of baselines) {
        for (const connector of baseline.definition.connectors ?? []) {
            if (connector.migration && !current.has(connectorIdentity(connector))) {
                throw new Error(
                    `Release removes or renames published migration-aware connector "${connectorName(connector)}"`,
                );
            }
        }
    }
}

function publishedMigrations(connector: Connector, baselines: readonly LocalReleasePackage[]): Migration[] {
    const published = new Map<string, Migration>();
    for (const baseline of baselines) {
        const previous = (baseline.definition.connectors ?? []).find(
            (entry) => connectorIdentity(entry) === connectorIdentity(connector),
        );
        for (const migration of previous?.migration?.migrations ?? []) {
            const existing = published.get(migration.id);
            if (existing && !sameMigration(existing, migration)) {
                throw new Error(`Immutable baselines disagree about published migration "${migration.id}"`);
            }
            published.set(migration.id, migration);
        }
    }
    return [...published.values()];
}

function sameMigration(left: Migration, right: Migration): boolean {
    return isDeepStrictEqual(left, right);
}

function connectorIdentity(connector: Connector): string {
    return connector.connectorKey ?? `${connector.provider}:${connector.root ?? "."}`;
}

function connectorName(connector: Connector): string {
    return connector.connectorKey ?? connector.provider;
}
