import {
    BufferedEndpointPerformanceRecorder,
    InMemoryEndpointPerformanceStore,
    startEndpointPerformanceFlusher,
} from "@bernouy/cms-analytics";
import type { IntegrationConnectorDeployer } from "@bernouy/cms-integrations";
import { createLocalSourceTelemetry, createLocalTrustedConnectorTargetMatcher } from "./sourceTelemetry";

export async function createLocalEndpointPerformance(
    mode: "DEV" | "PROD",
    deployers: readonly IntegrationConnectorDeployer[],
) {
    const reports = new InMemoryEndpointPerformanceStore();
    const recorder = new BufferedEndpointPerformanceRecorder(reports, {
        collectorId: mode === "PROD" ? "p9r-preview" : "p9r-dev",
    });
    const flusher = startEndpointPerformanceFlusher(recorder, {
        onError: (error) => console.error("Endpoint performance flush failed", error),
    });
    const uniformSampleRate = mode === "PROD" ? 0.01 : 1;
    return {
        reports,
        controlTelemetry: createLocalSourceTelemetry("control", recorder, uniformSampleRate),
        deliveryTelemetry: createLocalSourceTelemetry("delivery", recorder, uniformSampleRate),
        trustedConnectorTarget: await createLocalTrustedConnectorTargetMatcher(deployers),
        stopFlusher: flusher.stop,
        flush: flusher.run,
    };
}
