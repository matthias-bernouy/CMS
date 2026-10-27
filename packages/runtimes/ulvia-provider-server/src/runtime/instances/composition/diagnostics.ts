import { ObservabilityError, assertLogAcknowledgement } from "@bernouy/cms-observability";
import type { Logger } from "@bernouy/logging";
import { createNodeLogSink } from "@bernouy/logging/node";
import { createObservabilityLogger, LogDeliveryError } from "@bernouy/cms-observability/logging";
import { currentRequestLogAttributes, runWithoutRequestContext } from "@bernouy/http-runner/observability";
import type { ProviderStores } from "../../stores/providerStores";
import type { createProviderGateway } from "../../gateway/createProviderGateway";

export function createInstanceDiagnostics(instanceId: string, fallback: Logger) {
    return createObservabilityLogger({
        service: "ulvia-provider",
        level: fallback.isEnabled("debug") ? "debug" : "info",
        includeErrorStack: true,
        context: currentRequestLogAttributes,
        attributes: { instanceId },
        fallback: createNodeLogSink({
            service: "ulvia-provider",
            level: fallback.isEnabled("debug") ? "debug" : "info",
            format: fallback.isEnabled("debug") ? "pretty" : "json",
        }),
    });
}

export function connectInstanceDiagnostics(
    diagnostics: ReturnType<typeof createInstanceDiagnostics>,
    stores: ProviderStores,
    gateway: Awaited<ReturnType<typeof createProviderGateway>>,
    instanceId: string,
): void {
    runWithoutRequestContext(() =>
        diagnostics.collector.connect(async (entries) => {
            const route = await gateway.routes.resolve(gateway.siteId, "ulvia.cms.observability");
            if (!route) {
                throw new Error("Observability selection is unavailable");
            }
            if (
                route.installation.observation?.report.instanceId === instanceId &&
                (await gateway.routes.isCurrent(route))
            ) {
                try {
                    await stores.observability.append({ entries }, "ulvia-provider");
                } catch (error) {
                    if (error instanceof ObservabilityError) {
                        throw new LogDeliveryError(false);
                    }
                    throw error;
                }
                return;
            }
            const result = await gateway.invoker.invoke({
                siteId: gateway.siteId,
                contractId: "ulvia.cms.observability",
                capabilityId: "logs.append",
                input: { entries },
                actor: { kind: "system", serviceId: "ulvia-provider" },
            });
            if (result.kind !== "success") {
                throw new LogDeliveryError(result.kind !== "declared-error" || result.retryable);
            }
            assertLogAcknowledgement(result.output, entries.length);
        }),
    );
}
