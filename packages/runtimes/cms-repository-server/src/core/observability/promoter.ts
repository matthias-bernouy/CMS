import type {
    IntegrationRegistryStablePromoter,
    IntegrationRegistryStablePromotionRequest,
    IntegrationRegistryStablePromotionResult,
} from "@bernouy/cms-integration-registry";
import { failedOperation } from "./outcome";
import type { RepositoryOperationalTelemetry } from "./telemetry";

export class ObservedIntegrationRegistryStablePromoter implements IntegrationRegistryStablePromoter {
    constructor(
        private readonly promoter: IntegrationRegistryStablePromoter,
        private readonly telemetry: RepositoryOperationalTelemetry,
    ) {}

    async promoteStable(
        request: IntegrationRegistryStablePromotionRequest,
    ): Promise<IntegrationRegistryStablePromotionResult> {
        const span = this.telemetry.start("stable-promotion", {
            kind: request.kind,
            version: request.version,
            reportRevisionId: request.currentReportRevisionId,
        });
        try {
            const result = await this.promoter.promoteStable(request);
            this.telemetry.finish(span, "succeeded", {
                operationId: result.operationId,
                digest: result.record.packageDigest,
                reportRevisionId: result.record.reportRevisionId,
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
