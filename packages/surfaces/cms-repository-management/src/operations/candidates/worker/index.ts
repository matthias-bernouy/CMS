import type { Runner } from "@bernouy/http-runner";
import type { RepositoryCandidateWorkerRoutesConfig } from "../contracts";
import { mountAuthenticatedWorkerRoutes } from "./authenticatedRoutes";
import { mountWorkerResultRoutes } from "./resultRoutes";

export function mountRepositoryCandidateWorkerRoutes(
    authenticatedRunner: Runner,
    capabilityRunner: Runner,
    config: RepositoryCandidateWorkerRoutesConfig,
): void {
    assertConfig(config);
    mountAuthenticatedWorkerRoutes(authenticatedRunner, config);
    mountWorkerResultRoutes(capabilityRunner, config);
}

export function mountRepositoryCandidateAuthenticatedWorkerRoutes(
    runner: Runner,
    config: RepositoryCandidateWorkerRoutesConfig,
): void {
    assertConfig(config);
    mountAuthenticatedWorkerRoutes(runner, config);
}

export function mountRepositoryCandidateCapabilityRoutes(
    runner: Runner,
    config: RepositoryCandidateWorkerRoutesConfig,
): void {
    assertConfig(config);
    mountWorkerResultRoutes(runner, config);
}

function assertConfig(config: RepositoryCandidateWorkerRoutesConfig): void {
    for (const [label, value] of [
        ["Worker body limit", config.maxBodyBytes],
        ["Worker result body limit", config.maxResultBodyBytes],
        ["Worker lease duration", config.leaseDurationMs],
    ] as const) {
        if (!Number.isSafeInteger(value) || value < 1) {
            throw new TypeError(`${label} must be a positive safe integer`);
        }
    }
    if (
        !config.store ||
        !config.capabilityAuthority ||
        typeof config.now !== "function" ||
        typeof config.createJobId !== "function" ||
        typeof config.createAttemptId !== "function"
    ) {
        throw new TypeError("Candidate worker protocol dependencies are required");
    }
}
