import type { VerificationReport } from "@bernouy/cms-integration-verification";
import { assertReportRevisionFollows, identifyVerificationReport } from "@bernouy/cms-integration-verification";
import type {
    AppendReleaseReportRequest,
    IntegrationVerificationReportStore,
    ReleaseReportHistory,
} from "../../../../../../interfaces/reportStore";
import { FsReleaseReportHistoryStore, type FsReleaseReportHistoryStoreConfig } from "../store";
import type { FsReleaseReportHistoryAdapter, FsReleaseVersionKey } from "../types";
import { assertCatalogVersion, parseVersionKey, versionKey } from "./shared";

const adapter: FsReleaseReportHistoryAdapter<VerificationReport, FsReleaseVersionKey> = {
    stream: "verification",
    identify: identifyVerificationReport,
    parseKey: parseVersionKey,
    key: versionKey,
    revisionId: (report) => report.reportId,
    historyFields: (report) => report,
    assertFollows: assertReportRevisionFollows,
    assertCatalog: (snapshot, report) => assertCatalogVersion(snapshot, versionKey(report)),
    mutationKind: (key) => key.kind,
};

export class FsIntegrationVerificationReportStore implements IntegrationVerificationReportStore {
    private readonly store: FsReleaseReportHistoryStore<VerificationReport, FsReleaseVersionKey>;

    constructor(private readonly config: FsReleaseReportHistoryStoreConfig) {
        this.store = new FsReleaseReportHistoryStore(config, adapter);
    }

    async get(kind: string, version: string): Promise<ReleaseReportHistory<VerificationReport> | null> {
        const location = this.config.snapshots.current().locateExactVersion(kind, version);
        return location ? await this.store.get({ kind, version, packageDigest: location.package.digest }) : null;
    }

    async append(
        request: AppendReleaseReportRequest<VerificationReport>,
    ): Promise<ReleaseReportHistory<VerificationReport>> {
        return await this.store.append(request);
    }
}

export const fsVerificationReportAdapter = adapter;
