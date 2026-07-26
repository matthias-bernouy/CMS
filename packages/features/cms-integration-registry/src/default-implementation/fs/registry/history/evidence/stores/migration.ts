import type { MigrationReport } from "@bernouy/cms-integration-verification";
import { assertReportRevisionFollows, identifyMigrationReport } from "@bernouy/cms-integration-verification";
import type {
    AppendReleaseReportRequest,
    IntegrationMigrationReportLogicalKey,
    IntegrationMigrationReportStore,
    ReleaseReportHistory,
} from "../../../../../../interfaces/reportStore";
import { FsReleaseReportHistoryStore, type FsReleaseReportHistoryStoreConfig } from "../store";
import type { FsReleaseReportHistoryAdapter } from "../types";
import { assertCatalogVersion, migrationKey, parseMigrationKey } from "./shared";

const adapter: FsReleaseReportHistoryAdapter<MigrationReport, IntegrationMigrationReportLogicalKey> = {
    stream: "migration",
    identify: identifyMigrationReport,
    parseKey: parseMigrationKey,
    key: migrationKey,
    revisionId: (report) => report.reportId,
    historyFields: (report) => report,
    assertFollows: assertReportRevisionFollows,
    assertCatalog: (snapshot, report) => {
        assertCatalogVersion(snapshot, {
            kind: report.source.kind,
            version: report.source.version,
            packageDigest: report.source.packageDigest,
        });
        assertCatalogVersion(snapshot, {
            kind: report.target.kind,
            version: report.target.version,
            packageDigest: report.target.packageDigest,
        });
    },
    mutationKind: (key) => key.targetKind,
};

export class FsIntegrationMigrationReportStore implements IntegrationMigrationReportStore {
    private readonly store: FsReleaseReportHistoryStore<MigrationReport, IntegrationMigrationReportLogicalKey>;

    constructor(config: FsReleaseReportHistoryStoreConfig) {
        this.store = new FsReleaseReportHistoryStore(config, adapter);
    }

    async get(key: IntegrationMigrationReportLogicalKey): Promise<ReleaseReportHistory<MigrationReport> | null> {
        return await this.store.get(parseMigrationKey(key));
    }

    async append(request: AppendReleaseReportRequest<MigrationReport>): Promise<ReleaseReportHistory<MigrationReport>> {
        return await this.store.append(request);
    }
}

export const fsMigrationReportAdapter = adapter;
