import { assertLogAcknowledgement } from "@bernouy/cms-observability";
import { createNodeLogSink } from "@bernouy/logging/node";
import { createObservabilityLogger, LogDeliveryError } from "@bernouy/cms-observability/logging";
import { currentRequestLogAttributes } from "@bernouy/http-runner/observability";
import type { createKernelGateway } from "./gateway/createKernelGateway";

export function createKernelDiagnostics(environment: Record<string, string | undefined>) {
    const development = environment.MODE === "DEV";
    const fallback = createNodeLogSink({
        service: "cms-kernel",
        level: development ? "debug" : "info",
        format: development ? "pretty" : "json",
        includeErrorStack: true,
    });
    return createObservabilityLogger({
        service: "cms-kernel",
        level: development ? "debug" : "info",
        includeErrorStack: true,
        context: currentRequestLogAttributes,
        fallback,
    });
}

export async function connectKernelDiagnostics(
    diagnostics: ReturnType<typeof createKernelDiagnostics>,
    gateway: ReturnType<typeof createKernelGateway>,
): Promise<void> {
    const contract = await gateway.invoker.resolveContract({
        siteId: "default",
        contractId: "ulvia.cms.observability",
    });
    for (const capabilityId of ["logs.append", "logs.query", "logs.get", "logs.aggregate"]) {
        if (!contract.release.capabilities.some(({ id }) => id === capabilityId)) {
            throw new Error(`Required observability capability is unavailable: ${capabilityId}`);
        }
    }
    await gateway.invoker.assertAuthorized({
        siteId: "default",
        contractId: "ulvia.cms.observability",
        capabilityId: "logs.append",
        actor: { kind: "system", serviceId: "cms-kernel" },
    });
    diagnostics.collector.connect(async (entries) => {
        const result = await gateway.invoker.invoke({
            siteId: "default",
            contractId: "ulvia.cms.observability",
            capabilityId: "logs.append",
            input: { entries },
            actor: { kind: "system", serviceId: "cms-kernel" },
        });
        if (result.kind !== "success") {
            throw new LogDeliveryError(result.kind !== "declared-error" || result.retryable);
        }
        assertLogAcknowledgement(result.output, entries.length);
    });
}
