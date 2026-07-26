import type {
    IntegrationRegistryPublicationRequest,
    IntegrationRegistryPublicationResult,
    IntegrationRegistryPublisher,
} from "@bernouy/cms-integration-registry";
import { failedOperation } from "./outcome";
import type { RepositoryOperationalTelemetry } from "./telemetry";

export class ObservedIntegrationRegistryPublisher implements IntegrationRegistryPublisher {
    constructor(
        private readonly publisher: IntegrationRegistryPublisher,
        private readonly telemetry: RepositoryOperationalTelemetry,
    ) {}

    async publish(request: IntegrationRegistryPublicationRequest): Promise<IntegrationRegistryPublicationResult> {
        const span = this.telemetry.start("publication", {
            kind: request.package.envelope.kind,
            version: request.package.envelope.version,
            digest: request.package.digest,
        });
        try {
            const result = await this.publisher.publish(request);
            this.telemetry.finish(span, "succeeded", {
                operationId: result.operationId,
                digest: result.digest,
                report: result.report,
            });
            return result;
        } catch (error) {
            const failure = failedOperation(error);
            this.telemetry.finish(span, failure.outcome, failure);
            throw error;
        }
    }
}
