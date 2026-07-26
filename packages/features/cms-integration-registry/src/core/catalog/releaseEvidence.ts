import type {
    IntegrationRegistryCatalogSnapshotProvider,
    IntegrationRegistryReleaseEvidence,
    IntegrationRegistryReleaseEvidenceReader,
} from "../../interfaces/catalog";
import type {
    IntegrationCompatibilityV2ReportStore,
    IntegrationMigrationReportLogicalKey,
    IntegrationMigrationReportStore,
    IntegrationVerificationReportStore,
    ReleaseAdmissionDecisionStore,
} from "../../interfaces/reportStore";

export type IntegrationRegistryReleaseEvidenceReaderConfig = Readonly<{
    catalog: IntegrationRegistryCatalogSnapshotProvider;
    compatibility: IntegrationCompatibilityV2ReportStore;
    verification: IntegrationVerificationReportStore;
    migrations: IntegrationMigrationReportStore;
    decisions: ReleaseAdmissionDecisionStore;
}>;

export class CurrentIntegrationRegistryReleaseEvidenceReader implements IntegrationRegistryReleaseEvidenceReader {
    constructor(private readonly config: IntegrationRegistryReleaseEvidenceReaderConfig) {}

    async get(kind: string, version: string): Promise<IntegrationRegistryReleaseEvidence | null> {
        const snapshot = this.config.catalog.current();
        const location = snapshot.locateExactVersion(kind, version);
        const versionEntry = snapshot.getIndex(kind)?.versions.find((entry) => entry.version === version);
        if (!location || !versionEntry) {
            return null;
        }
        const [compatibility, verification, decision] = await Promise.all([
            this.config.compatibility.get(kind, version),
            this.config.verification.get(kind, version),
            this.config.decisions.get(kind, version),
        ]);
        const migrations = decision
            ? await Promise.all(
                  decision.current.migrationReports.map((reference) =>
                      this.config.migrations.get(migrationKey(decision.current, reference)),
                  ),
              )
            : [];
        if (migrations.some((history) => history === null)) {
            throw new Error("Current release decision references unavailable migration evidence");
        }
        return Object.freeze({
            kind,
            version,
            packageDigest: location.package.digest,
            ...(versionEntry.status ? { status: versionEntry.status } : {}),
            ...(versionEntry.verificationDigest ? { verificationDigest: versionEntry.verificationDigest } : {}),
            ...(compatibility ? { compatibility } : {}),
            ...(verification ? { verification } : {}),
            migrations: Object.freeze(migrations.filter((history) => history !== null)),
            ...(decision ? { decision } : {}),
        });
    }
}

function migrationKey(
    decision: NonNullable<IntegrationRegistryReleaseEvidence["decision"]>["current"],
    reference: NonNullable<IntegrationRegistryReleaseEvidence["decision"]>["current"]["migrationReports"][number],
): IntegrationMigrationReportLogicalKey {
    return {
        sourceKind: reference.source.kind,
        sourceVersion: reference.source.version,
        sourcePackageDigest: reference.source.packageDigest,
        targetKind: decision.kind,
        targetVersion: decision.version,
        targetPackageDigest: decision.packageDigest,
        connectorKey: reference.connectorKey,
        lineageId: reference.lineageId,
        migrationRevision: reference.migrationRevision,
    };
}
