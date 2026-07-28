import { absolutePath, boundedInteger, identifier, repositoryOrigin } from "./values";

export type IntegrationVerifierEnvSource = Record<string, string | undefined>;

export type IntegrationVerifierRuntimeEnv = Readonly<{
    repositoryUrl: string;
    workerId: string;
    workerTokenFile: string;
    requestTimeoutMs: number;
    maxResponseBytes: number;
    jobListLimit: number;
    leaseRenewalIntervalMs: number;
    pollIntervalMs: number;
    errorBackoffMs: number;
}>;

export function readIntegrationVerifierRuntimeEnv(source: IntegrationVerifierEnvSource): IntegrationVerifierRuntimeEnv {
    if (source.CMS_INTEGRATION_VERIFIER_WORKER_TOKEN !== undefined) {
        throw new Error("CMS_INTEGRATION_VERIFIER_WORKER_TOKEN is forbidden; configure the secret file instead");
    }
    return Object.freeze({
        repositoryUrl: repositoryOrigin(source.CMS_INTEGRATION_VERIFIER_REPOSITORY_URL),
        workerId: identifier(source.CMS_INTEGRATION_VERIFIER_WORKER_ID, "CMS_INTEGRATION_VERIFIER_WORKER_ID"),
        workerTokenFile: absolutePath(
            source.CMS_INTEGRATION_VERIFIER_WORKER_TOKEN_FILE ?? "/run/secrets/cms-integration-verifier-worker-token",
            "CMS_INTEGRATION_VERIFIER_WORKER_TOKEN_FILE",
        ),
        requestTimeoutMs: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_REQUEST_TIMEOUT_MS,
            "CMS_INTEGRATION_VERIFIER_REQUEST_TIMEOUT_MS",
            15_000,
            100,
            120_000,
        ),
        maxResponseBytes: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_MAX_RESPONSE_BYTES,
            "CMS_INTEGRATION_VERIFIER_MAX_RESPONSE_BYTES",
            40 * 1_048_576,
            1_048_576,
            64 * 1_048_576,
        ),
        jobListLimit: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_JOB_LIST_LIMIT,
            "CMS_INTEGRATION_VERIFIER_JOB_LIST_LIMIT",
            1,
            1,
            100,
        ),
        leaseRenewalIntervalMs: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_LEASE_RENEWAL_INTERVAL_MS,
            "CMS_INTEGRATION_VERIFIER_LEASE_RENEWAL_INTERVAL_MS",
            30_000,
            1_000,
            300_000,
        ),
        pollIntervalMs: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_POLL_INTERVAL_MS,
            "CMS_INTEGRATION_VERIFIER_POLL_INTERVAL_MS",
            5_000,
            100,
            300_000,
        ),
        errorBackoffMs: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_ERROR_BACKOFF_MS,
            "CMS_INTEGRATION_VERIFIER_ERROR_BACKOFF_MS",
            10_000,
            100,
            600_000,
        ),
    });
}
