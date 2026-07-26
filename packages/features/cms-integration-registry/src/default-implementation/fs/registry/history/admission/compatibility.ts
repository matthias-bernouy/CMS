import type { IntegrationCompatibilityReport } from "../../../../../interfaces/compatibility";
import type {
    IntegrationCompatibilityReportStore,
    IntegrationCompatibilityV2ReportStore,
    ReleaseReportHistory,
} from "../../../../../interfaces/reportStore";
import type { CompatibilityReportV2 } from "@bernouy/cms-integration-verification";
import { projectCompatibilityReportV2 } from "../../../../../core/compatibility/evaluation/v2Projection";
import { ReleaseReportConflictError } from "../../../../../core/compatibility/reportStoreErrors";

export async function recoverCurrentCompatibilityProjection(input: {
    kind: string;
    version: string;
    legacy: IntegrationCompatibilityReportStore;
    projected: IntegrationCompatibilityV2ReportStore;
}): Promise<ReleaseReportHistory<CompatibilityReportV2> | null> {
    return await recoverCurrentCompatibilityProjectionAttempt(input, 2);
}

async function recoverCurrentCompatibilityProjectionAttempt(
    input: {
        kind: string;
        version: string;
        legacy: IntegrationCompatibilityReportStore;
        projected: IntegrationCompatibilityV2ReportStore;
    },
    retries: number,
): Promise<ReleaseReportHistory<CompatibilityReportV2> | null> {
    const [legacy, projected] = await Promise.all([
        input.legacy.get(input.kind, input.version),
        input.projected.get(input.kind, input.version),
    ]);
    if (!legacy || !projected || !legacyRevisionIsNewer(legacy.reports, legacy.current, projected.current)) {
        return projected;
    }
    const revision = legacy.current;
    if (revision.reportType !== "revision") {
        return projected;
    }
    const recovery = await projectCompatibilityReportV2({
        report: revision,
        history: {
            reportId: projectedReportId(revision),
            revisionType: "revision",
            origin: projected.current.origin,
            createdAt: revision.createdAt,
            supersedes: projected.currentRevisionId,
        },
        provenance: revision.provenance,
    });
    try {
        return await input.projected.append({
            report: recovery.report,
            expectedCurrent: {
                revisionId: projected.currentRevisionId,
                reportDigest: projected.currentReportDigest,
            },
        });
    } catch (error) {
        if (error instanceof ReleaseReportConflictError && retries > 0) {
            return await recoverCurrentCompatibilityProjectionAttempt(input, retries - 1);
        }
        throw error;
    }
}

function legacyRevisionIsNewer(
    legacyReports: readonly IntegrationCompatibilityReport[],
    legacy: IntegrationCompatibilityReport,
    projected: CompatibilityReportV2,
): boolean {
    if (legacy.reportType !== "revision" || projected.reportId === projectedReportId(legacy)) {
        return false;
    }
    const legacyTime = Date.parse(legacy.createdAt);
    const projectedTime = Date.parse(projected.createdAt);
    if (legacyTime !== projectedTime) {
        return legacyTime > projectedTime;
    }
    if (projected.revisionType === "root") {
        return true;
    }
    const projectedLegacyIndex = legacyReports.findIndex((report) => projected.reportId === projectedReportId(report));
    return projectedLegacyIndex >= 0 && projectedLegacyIndex < legacyReports.length - 1;
}

function projectedReportId(report: IntegrationCompatibilityReport): string {
    return `compat-${report.id}`;
}
