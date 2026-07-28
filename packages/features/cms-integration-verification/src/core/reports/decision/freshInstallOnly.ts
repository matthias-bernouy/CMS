import type {
    CompatibilityReleaseLevel,
    MigrationReport,
    RequiredMigrationEvidence,
} from "../../../interfaces/reports";

type MigrationEvidence = Pick<MigrationReport, "connectorKey" | "lineageId" | "outcome" | "source">;

export function isIntegrationReleaseFreshInstallOnly(
    input: Readonly<{
        releaseLevel: CompatibilityReleaseLevel | undefined;
        requiredMigrations: readonly RequiredMigrationEvidence[];
        migrations: readonly MigrationEvidence[];
    }>,
): boolean {
    const passedMigrations = input.migrations.filter(({ outcome }) => outcome === "passed");
    if (input.requiredMigrations.length === 0) {
        return input.releaseLevel === "major" && passedMigrations.length === 0;
    }
    return !input.requiredMigrations.every((requirement) =>
        passedMigrations.some((migration) => coversRequirement(migration, requirement)),
    );
}

function coversRequirement(migration: MigrationEvidence, requirement: RequiredMigrationEvidence): boolean {
    return (
        migration.source.kind === requirement.source.kind &&
        migration.source.version === requirement.source.version &&
        migration.source.packageDigest === requirement.source.packageDigest &&
        migration.connectorKey === requirement.connectorKey &&
        migration.lineageId === requirement.lineageId
    );
}
