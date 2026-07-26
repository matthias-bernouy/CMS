import type { IntegrationRegistryCatalogSnapshot } from "../../../../../interfaces/catalog";
import type { IntegrationMigrationReportStore, ReleaseReportHistory } from "../../../../../interfaces/reportStore";
import type {
    MigrationReport,
    ReleaseAdmissionDecision,
    RequiredMigrationEvidence,
} from "@bernouy/cms-integration-verification";

export async function currentRequiredMigrationReports(input: {
    snapshot: IntegrationRegistryCatalogSnapshot;
    migrations: IntegrationMigrationReportStore;
    current: ReleaseAdmissionDecision;
}): Promise<readonly ReleaseReportHistory<MigrationReport>[]> {
    const target = input.snapshot.locateExactVersion(input.current.kind, input.current.version);
    if (!target || target.package.digest !== input.current.packageDigest) {
        throw new Error("Current release admission target is absent from the captured catalog");
    }
    const histories = await Promise.all(
        input.current.statefulChanges.requiredMigrations.map(async (requirement) => {
            const migrationRevision = targetMigrationRevision(target.definitionSnapshot.connectors, requirement);
            if (migrationRevision === null) {
                return null;
            }
            return await input.migrations.get({
                sourceKind: requirement.source.kind,
                sourceVersion: requirement.source.version,
                sourcePackageDigest: requirement.source.packageDigest,
                targetKind: input.current.kind,
                targetVersion: input.current.version,
                targetPackageDigest: input.current.packageDigest,
                connectorKey: requirement.connectorKey,
                lineageId: requirement.lineageId,
                migrationRevision,
            });
        }),
    );
    return histories.filter((history): history is ReleaseReportHistory<MigrationReport> => history !== null);
}

function targetMigrationRevision(
    connectors:
        | ReadonlyArray<{
              connectorKey?: string;
              lineageId?: string;
              migrationRevision?: number;
          }>
        | undefined,
    requirement: RequiredMigrationEvidence,
): number | null {
    const connector = connectors?.find(
        (candidate) =>
            candidate.connectorKey === requirement.connectorKey && candidate.lineageId === requirement.lineageId,
    );
    return connector && Number.isSafeInteger(connector.migrationRevision) && connector.migrationRevision! > 0
        ? connector.migrationRevision!
        : null;
}
