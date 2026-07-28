import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { IntegrationCompatibilityEvaluator } from "../../../../core/compatibility/evaluation";
import {
    ReleaseReportConflictError,
    ReleaseReportIntegrityError,
} from "../../../../core/compatibility/reportStoreErrors";
import {
    IntegrationCompatibilityReevaluationConflictError,
    IntegrationCompatibilityReevaluationIntegrityError,
    IntegrationCompatibilityReevaluationNotFoundError,
    IntegrationCompatibilityReevaluationPendingActivationError,
    IntegrationCompatibilityReevaluationStaleReportError,
} from "../../../../core/compatibility/reevaluation/errors";
import { validateCompatibilityReevaluationRequest } from "../../../../core/compatibility/reevaluation/request";
import type { IntegrationRegistryCatalogSnapshotProvider } from "../../../../interfaces/catalog";
import type {
    IntegrationCompatibilityReevaluationRequest,
    IntegrationCompatibilityReevaluator,
} from "../../../../interfaces/reevaluation";
import type {
    IntegrationCompatibilityV2ReportStore,
    ReviewedSchemaBaselineStore,
} from "../../../../interfaces/reportStore";
import { buildFsCompatibilityReevaluationInput } from "./input";
import {
    captureReleaseReevaluationContext,
    reconcileReevaluatedRelease,
    type ReleaseReevaluationConfig,
} from "./release";

export type FsIntegrationCompatibilityReevaluatorConfig = Readonly<{
    snapshots: IntegrationRegistryCatalogSnapshotProvider;
    reports: IntegrationCompatibilityV2ReportStore;
    evaluator: IntegrationCompatibilityEvaluator;
    reviewedSchemaBaselines?: ReviewedSchemaBaselineStore;
    packageLimits?: Partial<IntegrationPackageLimits>;
    release?: ReleaseReevaluationConfig;
}>;

export class FsIntegrationCompatibilityReevaluator implements IntegrationCompatibilityReevaluator {
    constructor(private readonly config: FsIntegrationCompatibilityReevaluatorConfig) {}

    async reevaluate(request: IntegrationCompatibilityReevaluationRequest) {
        const validated = validateCompatibilityReevaluationRequest(request);
        const snapshot = this.config.snapshots.current();
        const location = snapshot.locateExactVersion(validated.kind, validated.version);
        if (!location) {
            throw new IntegrationCompatibilityReevaluationNotFoundError(validated.kind, validated.version);
        }
        const version = snapshot.listVersions(validated.kind).find((entry) => entry.version === validated.version);
        if (!version) {
            throw new IntegrationCompatibilityReevaluationIntegrityError(
                "Compatibility reevaluation target is missing from its validated catalog index",
            );
        }
        if (version.status === "unverified") {
            throw new IntegrationCompatibilityReevaluationPendingActivationError(validated.kind, validated.version);
        }
        let history;
        try {
            history = await this.config.reports.get(validated.kind, validated.version);
        } catch (error) {
            if (error instanceof ReleaseReportIntegrityError) {
                throw new IntegrationCompatibilityReevaluationIntegrityError(
                    "Compatibility history cannot be read from immutable registry state",
                    { cause: error },
                );
            }
            throw error;
        }
        if (!history) {
            throw new IntegrationCompatibilityReevaluationNotFoundError(validated.kind, validated.version);
        }
        assertCurrentReport(validated.currentReport, history);
        const release = this.config.release
            ? await captureReleaseReevaluationContext(this.config.release, validated, history)
            : null;
        const root = history.revisions[0];
        if (!root || root.revisionType !== "root") {
            throw new IntegrationCompatibilityReevaluationIntegrityError(
                "Compatibility history has no immutable root revision",
            );
        }
        const input = await buildFsCompatibilityReevaluationInput(
            snapshot,
            root,
            this.config.packageLimits,
            this.config.reviewedSchemaBaselines,
        );
        let revision;
        try {
            revision = (
                await this.config.evaluator.buildRevision(input, history.current, {
                    actor: validated.actor,
                    reason: validated.reason,
                    ...(validated.evidenceIds ? { evidenceIds: validated.evidenceIds } : {}),
                })
            ).report;
        } catch (error) {
            throw new IntegrationCompatibilityReevaluationIntegrityError(
                "Compatibility reevaluation input cannot be evaluated from immutable registry state",
                { cause: error },
            );
        }
        try {
            const appended = await this.config.reports.append({
                report: revision,
                expectedCurrent: validated.currentReport,
            });
            const releaseResult =
                release && this.config.release
                    ? await reconcileReevaluatedRelease({
                          release: this.config.release,
                          revision,
                      })
                    : undefined;
            return Object.freeze({ revision, history: appended, ...(releaseResult ? { release: releaseResult } : {}) });
        } catch (error) {
            if (error instanceof ReleaseReportConflictError) {
                await this.throwConcurrentConflict(validated, error);
            }
            throw error;
        }
    }

    private async throwConcurrentConflict(
        request: IntegrationCompatibilityReevaluationRequest,
        cause: ReleaseReportConflictError,
    ): Promise<never> {
        const current = await this.config.reports.get(request.kind, request.version);
        if (!current) {
            throw new IntegrationCompatibilityReevaluationNotFoundError(request.kind, request.version);
        }
        if (
            current.currentRevisionId !== request.currentReport.revisionId ||
            current.currentReportDigest !== request.currentReport.reportDigest
        ) {
            throw new IntegrationCompatibilityReevaluationStaleReportError(
                request.currentReport.revisionId,
                current.currentRevisionId,
            );
        }
        throw new IntegrationCompatibilityReevaluationConflictError(
            "Compatibility reevaluation could not append a unique report revision",
            { cause },
        );
    }
}

function assertCurrentReport(
    requested: Readonly<{ revisionId: string; reportDigest: string }>,
    current: Readonly<{ currentRevisionId: string; currentReportDigest: string }>,
): void {
    if (requested.revisionId !== current.currentRevisionId || requested.reportDigest !== current.currentReportDigest) {
        throw new IntegrationCompatibilityReevaluationStaleReportError(requested.revisionId, current.currentRevisionId);
    }
}
