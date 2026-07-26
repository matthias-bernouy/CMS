import type { IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { IntegrationCompatibilityEvaluator } from "../../../../core/compatibility/evaluation";
import {
    IntegrationCompatibilityHistoryNotFoundError,
    IntegrationCompatibilityRevisionConflictError,
} from "../../../../core/compatibility/reportStoreErrors";
import {
    IntegrationCompatibilityReevaluationConflictError,
    IntegrationCompatibilityReevaluationIntegrityError,
    IntegrationCompatibilityReevaluationNotFoundError,
    IntegrationCompatibilityReevaluationStaleReportError,
} from "../../../../core/compatibility/reevaluation/errors";
import { validateCompatibilityReevaluationRequest } from "../../../../core/compatibility/reevaluation/request";
import type { IntegrationRegistryCatalogSnapshotProvider } from "../../../../interfaces/catalog";
import type {
    IntegrationCompatibilityReevaluationRequest,
    IntegrationCompatibilityReevaluator,
} from "../../../../interfaces/reevaluation";
import type { IntegrationCompatibilityReportStore } from "../../../../interfaces/reportStore";
import type { ReviewedSchemaBaselineStore } from "../../../../interfaces/reportStore";
import { buildFsCompatibilityReevaluationInput } from "./input";
import {
    appendReleaseReevaluationRevision,
    captureReleaseReevaluationContext,
    type ReleaseReevaluationConfig,
} from "./release";

export type FsIntegrationCompatibilityReevaluatorConfig = Readonly<{
    snapshots: IntegrationRegistryCatalogSnapshotProvider;
    reports: IntegrationCompatibilityReportStore;
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
        if (!snapshot.locateExactVersion(validated.kind, validated.version)) {
            throw new IntegrationCompatibilityReevaluationNotFoundError(validated.kind, validated.version);
        }
        const history = await this.config.reports.get(validated.kind, validated.version);
        if (!history) {
            throw new IntegrationCompatibilityReevaluationNotFoundError(validated.kind, validated.version);
        }
        assertCurrentReport(validated.currentReportRevisionId, history.current.id);
        const release = this.config.release
            ? await captureReleaseReevaluationContext(this.config.release, validated)
            : null;
        const input = await buildFsCompatibilityReevaluationInput(
            snapshot,
            history.admission,
            this.config.packageLimits,
            this.config.reviewedSchemaBaselines,
        );
        let revision;
        try {
            revision = this.config.evaluator.evaluateRevision(input, history.current.id, {
                actor: validated.actor,
                reason: validated.reason,
                ...(validated.evidenceIds ? { evidenceIds: validated.evidenceIds } : {}),
            });
        } catch (error) {
            throw new IntegrationCompatibilityReevaluationIntegrityError(
                "Compatibility reevaluation input cannot be evaluated from immutable registry state",
                { cause: error },
            );
        }
        try {
            const appended = await this.config.reports.appendRevision(revision);
            const releaseResult =
                release && this.config.release
                    ? await appendReleaseReevaluationRevision({
                          release: this.config.release,
                          revision,
                          context: release,
                      })
                    : undefined;
            return Object.freeze({ revision, history: appended, ...(releaseResult ? { release: releaseResult } : {}) });
        } catch (error) {
            if (error instanceof IntegrationCompatibilityHistoryNotFoundError) {
                throw new IntegrationCompatibilityReevaluationNotFoundError(validated.kind, validated.version);
            }
            if (error instanceof IntegrationCompatibilityRevisionConflictError) {
                await this.throwConcurrentConflict(validated, error);
            }
            throw error;
        }
    }

    private async throwConcurrentConflict(
        request: IntegrationCompatibilityReevaluationRequest,
        cause: IntegrationCompatibilityRevisionConflictError,
    ): Promise<never> {
        const current = await this.config.reports.get(request.kind, request.version);
        if (!current) {
            throw new IntegrationCompatibilityReevaluationNotFoundError(request.kind, request.version);
        }
        if (current.current.id !== request.currentReportRevisionId) {
            throw new IntegrationCompatibilityReevaluationStaleReportError(
                request.currentReportRevisionId,
                current.current.id,
            );
        }
        throw new IntegrationCompatibilityReevaluationConflictError(
            "Compatibility reevaluation could not append a unique report revision",
            { cause },
        );
    }
}

function assertCurrentReport(requested: string, current: string): void {
    if (requested !== current) {
        throw new IntegrationCompatibilityReevaluationStaleReportError(requested, current);
    }
}
