import type { ReleaseAdmissionDecision } from "@bernouy/cms-integration-verification";
import {
    assertReleaseAdmissionDecisionMatchesReports,
    identifyReleaseAdmissionDecision,
} from "@bernouy/cms-integration-verification";
import { ReleaseAdmissionDecisionStaleError } from "../../../../../../core/compatibility/reportStoreErrors";
import type {
    AppendReleaseReportRequest,
    IntegrationCompatibilityV2ReportStore,
    IntegrationMigrationReportStore,
    IntegrationVerificationReportStore,
    ReleaseAdmissionDecisionStore,
    ReleaseReportHistory,
} from "../../../../../../interfaces/reportStore";
import { FsReleaseReportHistoryStore, type FsReleaseReportHistoryStoreConfig } from "../store";
import type { FsReleaseReportHistoryAdapter, FsReleaseVersionKey } from "../types";
import { assertCatalogVersion, parseVersionKey, versionKey } from "./shared";

const adapter: FsReleaseReportHistoryAdapter<ReleaseAdmissionDecision, FsReleaseVersionKey> = {
    stream: "decision",
    identify: async (value) => {
        const identified = await identifyReleaseAdmissionDecision(value);
        return { report: identified.decision, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
    },
    parseKey: parseVersionKey,
    key: versionKey,
    revisionId: (decision) => decision.decisionId,
    historyFields: (decision) => decision,
    assertFollows: (previous, next) => {
        if (
            next.revisionType !== "revision" ||
            next.supersedes !== previous.decisionId ||
            next.kind !== previous.kind ||
            next.version !== previous.version ||
            next.packageDigest !== previous.packageDigest ||
            Date.parse(next.createdAt) < Date.parse(previous.createdAt)
        ) {
            throw new TypeError("Release admission decision does not supersede the exact current decision");
        }
    },
    assertCatalog: (snapshot, decision) => assertCatalogVersion(snapshot, versionKey(decision)),
    mutationKind: (key) => key.kind,
};

export type FsReleaseAdmissionDecisionStoreConfig = FsReleaseReportHistoryStoreConfig &
    Readonly<{
        compatibilityReports: IntegrationCompatibilityV2ReportStore;
        verificationReports: IntegrationVerificationReportStore;
        migrationReports: IntegrationMigrationReportStore;
    }>;

export class FsReleaseAdmissionDecisionStore implements ReleaseAdmissionDecisionStore {
    private readonly store: FsReleaseReportHistoryStore<ReleaseAdmissionDecision, FsReleaseVersionKey>;

    constructor(private readonly config: FsReleaseAdmissionDecisionStoreConfig) {
        this.store = new FsReleaseReportHistoryStore(config, adapter);
    }

    async get(kind: string, version: string): Promise<ReleaseReportHistory<ReleaseAdmissionDecision> | null> {
        return await this.config.mutations.runExclusive(kind, async () => {
            const location = this.config.snapshots.current().locateExactVersion(kind, version);
            if (!location) {
                return null;
            }
            const history = await this.store.get({ kind, version, packageDigest: location.package.digest });
            if (history) {
                await this.assertCurrentDecision(history.current);
            }
            return history;
        });
    }

    async append(
        request: AppendReleaseReportRequest<ReleaseAdmissionDecision>,
    ): Promise<ReleaseReportHistory<ReleaseAdmissionDecision>> {
        return await this.store.append(request, async (decision) => {
            await this.assertCurrentDecision(decision);
        });
    }

    private async assertCurrentDecision(decision: ReleaseAdmissionDecision): Promise<void> {
        try {
            const compatibility = await this.config.compatibilityReports.get(decision.kind, decision.version);
            if (!compatibility || !sameReference(decision.compatibilityReport, compatibility)) {
                stale("compatibility report is missing, substituted, or no longer current");
            }
            const verification = await this.config.verificationReports.get(decision.kind, decision.version);
            if (
                (decision.verificationReport &&
                    (!verification || !sameReference(decision.verificationReport, verification))) ||
                (!decision.verificationReport && verification)
            ) {
                stale("verification report is missing, substituted, omitted, or no longer current");
            }
            const migrations = [];
            for (const reference of decision.migrationReports) {
                const history = await this.config.migrationReports.get({
                    sourceKind: reference.source.kind,
                    sourceVersion: reference.source.version,
                    sourcePackageDigest: reference.source.packageDigest,
                    targetKind: decision.kind,
                    targetVersion: decision.version,
                    targetPackageDigest: decision.packageDigest,
                    connectorKey: reference.connectorKey,
                    lineageId: reference.lineageId,
                    migrationRevision: reference.migrationRevision,
                });
                if (!history || !sameReference(reference, history)) {
                    stale(`migration report ${reference.revisionId} is missing, substituted, or no longer current`);
                }
                migrations.push(history.current);
            }
            await assertReleaseAdmissionDecisionMatchesReports(decision, {
                compatibility: compatibility.current,
                ...(verification ? { verification: verification.current } : {}),
                migrations,
            });
        } catch (error) {
            if (error instanceof ReleaseAdmissionDecisionStaleError) {
                throw error;
            }
            throw new ReleaseAdmissionDecisionStaleError("Release admission decision could not be recomposed", {
                cause: error,
            });
        }
    }
}

function sameReference(
    expected: Readonly<{ revisionId: string; reportDigest: string }>,
    history: Readonly<{ currentRevisionId: string; currentReportDigest: string }>,
): boolean {
    return expected.revisionId === history.currentRevisionId && expected.reportDigest === history.currentReportDigest;
}

function stale(message: string): never {
    throw new ReleaseAdmissionDecisionStaleError(`Release admission decision is stale: ${message}`);
}

export const fsReleaseAdmissionDecisionAdapter = adapter;
