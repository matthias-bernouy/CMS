import type { CompatibilityReportV2 } from "@bernouy/cms-integration-verification";
import { assertReportRevisionFollows, identifyCompatibilityReportV2 } from "@bernouy/cms-integration-verification";
import type {
    AppendReleaseReportRequest,
    IntegrationCompatibilityV2ReportStore,
    ReleaseReportHistory,
} from "../../../../../../interfaces/reportStore";
import { FsReleaseReportHistoryStore, type FsReleaseReportHistoryStoreConfig } from "../store";
import type { FsReleaseReportHistoryAdapter, FsReleaseVersionKey } from "../types";
import { assertCatalogVersion, parseVersionKey, versionKey } from "./shared";

const adapter: FsReleaseReportHistoryAdapter<CompatibilityReportV2, FsReleaseVersionKey> = {
    stream: "compatibility",
    identify: identifyCompatibilityReportV2,
    parseKey: parseVersionKey,
    key: versionKey,
    revisionId: (report) => report.reportId,
    historyFields: (report) => report,
    assertFollows: assertReportRevisionFollows,
    assertCatalog: (snapshot, report) => assertCatalogVersion(snapshot, versionKey(report)),
    mutationKind: (key) => key.kind,
};

export class FsIntegrationCompatibilityV2ReportStore implements IntegrationCompatibilityV2ReportStore {
    private readonly store: FsReleaseReportHistoryStore<CompatibilityReportV2, FsReleaseVersionKey>;

    constructor(private readonly config: FsReleaseReportHistoryStoreConfig) {
        this.store = new FsReleaseReportHistoryStore(config, adapter);
    }

    async get(kind: string, version: string): Promise<ReleaseReportHistory<CompatibilityReportV2> | null> {
        const key = this.configuredKey(kind, version);
        return key ? await this.store.get(key) : null;
    }

    async append(
        request: AppendReleaseReportRequest<CompatibilityReportV2>,
    ): Promise<ReleaseReportHistory<CompatibilityReportV2>> {
        return await this.store.append(request);
    }

    private configuredKey(kind: string, version: string): FsReleaseVersionKey | null {
        const location = this.config.snapshots.current().locateExactVersion(kind, version);
        return location ? { kind, version, packageDigest: location.package.digest } : null;
    }
}

export const fsCompatibilityV2ReportAdapter = adapter;
