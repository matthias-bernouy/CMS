import type {
    IntegrationCompatibilityReevaluationRequest,
    IntegrationCompatibilityReevaluationResult,
    IntegrationCompatibilityReevaluator,
} from "@bernouy/cms-integration-registry";
import { failedOperation } from "./outcome";
import type { RepositoryOperationalTelemetry } from "./telemetry";

export class ObservedIntegrationCompatibilityReevaluator implements IntegrationCompatibilityReevaluator {
    constructor(
        private readonly reevaluator: IntegrationCompatibilityReevaluator,
        private readonly telemetry: RepositoryOperationalTelemetry,
    ) {}

    async reevaluate(
        request: IntegrationCompatibilityReevaluationRequest,
    ): Promise<IntegrationCompatibilityReevaluationResult> {
        const span = this.telemetry.start("compatibility-reevaluation", {
            kind: request.kind,
            version: request.version,
            reportRevisionId: request.currentReportRevisionId,
        });
        try {
            const result = await this.reevaluator.reevaluate(request);
            this.telemetry.finish(span, "succeeded", {
                digest: result.revision.packageDigest,
                report: result.revision,
                reportRevisionId: result.revision.id,
            });
            return result;
        } catch (error) {
            const failure = failedOperation(error);
            this.telemetry.finish(span, failure.outcome, {
                ...failure,
                reportRevisionId: request.currentReportRevisionId,
            });
            throw error;
        }
    }
}
