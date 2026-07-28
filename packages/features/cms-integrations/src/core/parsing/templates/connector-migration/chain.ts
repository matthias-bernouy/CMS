import type {
    DeclarativeConnectorMigrationDescriptor,
    DeclarativeConnectorMigrationPlan,
    DeclarativeConnectorMigrationSource,
} from "../../../../interfaces/IntegrationConnectorDeployer";
import { gt } from "semver";
import { invalidMigrationValue } from "./values";

export function assertMigrationChain(
    install: DeclarativeConnectorMigrationPlan["install"],
    migrations: DeclarativeConnectorMigrationDescriptor[],
    supportedSources: DeclarativeConnectorMigrationSource[],
    name: string,
    targetVersion?: string,
): void {
    const ordered = [...migrations].sort((left, right) => left.toRevision - right.toRevision);
    for (let index = 1; index < ordered.length; index += 1) {
        if (ordered[index]!.fromRevision !== ordered[index - 1]!.toRevision) {
            invalidMigrationValue(`${name}.migrations`, "must form one contiguous revision chain");
        }
    }
    for (const migration of ordered) {
        if (migration.toRevision > install.revision) {
            invalidMigrationValue(`${name}.migrations`, "must not advance beyond the install revision");
        }
        if (targetVersion && gt(migration.introducedIn, targetVersion)) {
            invalidMigrationValue(
                `${name}.migrations.${migration.id}.introducedIn`,
                `must not be newer than target release ${targetVersion}`,
            );
        }
    }
    for (const source of supportedSources) {
        assertPhaseOrderForSource(source, install.revision, ordered, name);
        assertSupportedSourceContinuity(source, install.revision, ordered, name);
    }
    const covered = new Map(install.coveredMigrations.map((entry) => [entry.id, entry]));
    if (covered.size !== install.coveredMigrations.length) {
        invalidMigrationValue(`${name}.install.coveredMigrations`, "must contain unique migration ids");
    }
    for (const migration of migrations) {
        const reference = covered.get(migration.id);
        if (
            !reference ||
            reference.checksum !== migration.checksum ||
            reference.revision !== migration.toRevision ||
            reference.introducedIn !== migration.introducedIn
        ) {
            invalidMigrationValue(
                `${name}.install.coveredMigrations`,
                `must exactly cover migration "${migration.id}"`,
            );
        }
    }
    if (covered.size !== migrations.length) {
        invalidMigrationValue(
            `${name}.install.coveredMigrations`,
            "must not reference migrations absent from the release",
        );
    }
}

function assertPhaseOrderForSource(
    source: DeclarativeConnectorMigrationSource,
    targetRevision: number,
    ordered: DeclarativeConnectorMigrationDescriptor[],
    name: string,
): void {
    let contractStarted = false;
    for (const migration of ordered.filter(
        (candidate) => candidate.toRevision > source.migrationRevision && candidate.toRevision <= targetRevision,
    )) {
        contractStarted ||= migration.phase === "contract";
        if (contractStarted && migration.phase === "expand") {
            invalidMigrationValue(
                `${name}.migrations`,
                `expand migrations must precede contract migrations for source range "${source.range}"`,
            );
        }
    }
}

function assertSupportedSourceContinuity(
    source: DeclarativeConnectorMigrationSource,
    targetRevision: number,
    ordered: DeclarativeConnectorMigrationDescriptor[],
    name: string,
): void {
    if (source.migrationRevision > targetRevision) {
        invalidMigrationValue(
            `${name}.supportedSources`,
            `source range "${source.range}" starts after the install revision`,
        );
    }
    let revision = source.migrationRevision;
    for (const migration of ordered.filter(
        (candidate) => candidate.toRevision > source.migrationRevision && candidate.toRevision <= targetRevision,
    )) {
        if (migration.fromRevision !== revision) {
            invalidMigrationValue(
                `${name}.supportedSources`,
                `source range "${source.range}" has no continuous migration chain from revision ${source.migrationRevision}`,
            );
        }
        revision = migration.toRevision;
    }
    if (revision !== targetRevision) {
        invalidMigrationValue(
            `${name}.supportedSources`,
            `source range "${source.range}" migration chain stops at revision ${revision}, expected ${targetRevision}`,
        );
    }
}

export function assertUniqueMigrationIds(values: Array<{ id: string }>, name: string): void {
    if (new Set(values.map((entry) => entry.id)).size !== values.length) {
        invalidMigrationValue(name, "must contain unique ids");
    }
}
