import { createNodeLogger } from "@bernouy/logging/node";
import { currentRequestLogAttributes } from "@bernouy/http-runner/observability";

/** Operator diagnostics cover startup and requests without an authenticated CMS instance. */
export function createRepositoryLogger(environment: Record<string, string | undefined>) {
    const development = environment.MODE === "DEV";
    return createNodeLogger({
        service: "official-repository",
        level: development ? "debug" : "info",
        format: development ? "pretty" : "json",
        includeErrorStack: true,
        context: currentRequestLogAttributes,
    });
}
