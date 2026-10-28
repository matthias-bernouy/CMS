import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import { type ProviderCapabilityClient, ProviderClientError } from "@bernouy/cms-gateway/provider";
import { assertLogAcknowledgement } from "@bernouy/cms-observability";
import { createObservabilityLogger, LogDeliveryError } from "@bernouy/cms-observability/logging";
import type { LogSink } from "@bernouy/logging";

/** The connection and logger belong to one authenticated customer context. */
export function createConnectedProviderLogger(options: {
    client: ProviderCapabilityClient;
    contract: ContractRelease;
    service: string;
    fallback: LogSink;
}) {
    if (options.contract.contractId !== "ulvia.cms.observability") {
        throw new TypeError("Expected the Observability contract");
    }
    const diagnostics = createObservabilityLogger({
        service: options.service,
        fallback: options.fallback,
        includeErrorStack: true,
    });
    diagnostics.collector.connect(async (entries) => {
        try {
            const result = await options.client.invoke(
                options.contract,
                "logs.append",
                { entries },
                { authority: "provider" },
            );
            assertLogAcknowledgement(result.output, entries.length);
        } catch (error) {
            if (error instanceof ProviderClientError) {
                throw new LogDeliveryError(error.retryable || error.code === "outcome_unknown");
            }
            throw error;
        }
    });
    return diagnostics;
}
