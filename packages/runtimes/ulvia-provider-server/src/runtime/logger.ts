import { createNodeLogger } from "@bernouy/logging/node";
import { currentRequestLogAttributes } from "@bernouy/http-runner/observability";

/** Operator diagnostics cover startup and requests without an authenticated CMS instance. */
export function createProviderLogger(environment: Record<string, string | undefined>) {
    const development = environment.MODE === "DEV";
    return createNodeLogger({
        service: "ulvia-provider",
        level: development ? "debug" : "info",
        format: development ? "pretty" : "json",
        includeErrorStack: true,
        context: currentRequestLogAttributes,
    });
}
