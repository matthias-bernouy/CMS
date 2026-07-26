import type { PinnedVerificationRunnerIdentity } from "@bernouy/cms-integration-verification";
import { absolutePath, boundedInteger, identifier, repositoryOrigin, runnerIdentity, sandboxArguments } from "./values";

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

export type IntegrationVerifierExecutableEnv = IntegrationVerifierRuntimeEnv &
    Readonly<{
        databaseProviderModule: string;
        sandboxExecutable: string;
        sandboxArguments: readonly string[];
        sandboxTempRoot: string;
        sandboxTimeoutMs: number;
        sandboxTerminationGraceMs: number;
        sandboxMaxOutputBytes: number;
        sandboxMaxErrorBytes: number;
        runnerIdentity: PinnedVerificationRunnerIdentity;
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

export function readIntegrationVerifierExecutableEnv(
    source: IntegrationVerifierEnvSource,
): IntegrationVerifierExecutableEnv {
    return Object.freeze({
        ...readIntegrationVerifierRuntimeEnv(source),
        databaseProviderModule: absolutePath(
            source.CMS_INTEGRATION_VERIFIER_DATABASE_PROVIDER_MODULE,
            "CMS_INTEGRATION_VERIFIER_DATABASE_PROVIDER_MODULE",
        ),
        sandboxExecutable: absolutePath(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_EXECUTABLE,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_EXECUTABLE",
        ),
        sandboxArguments: sandboxArguments(source.CMS_INTEGRATION_VERIFIER_SANDBOX_ARGUMENTS_JSON),
        sandboxTempRoot: absolutePath(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_TMP_ROOT,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_TMP_ROOT",
            "/tmp/cms-integration-verifier",
        ),
        sandboxTimeoutMs: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_TIMEOUT_MS,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_TIMEOUT_MS",
            600_000,
            1_000,
            3_600_000,
        ),
        sandboxTerminationGraceMs: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_TERMINATION_GRACE_MS,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_TERMINATION_GRACE_MS",
            2_000,
            10,
            30_000,
        ),
        sandboxMaxOutputBytes: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_OUTPUT_BYTES,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_OUTPUT_BYTES",
            1_048_576,
            1_024,
            4 * 1_048_576,
        ),
        sandboxMaxErrorBytes: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_ERROR_BYTES,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_ERROR_BYTES",
            65_536,
            1_024,
            1_048_576,
        ),
        runnerIdentity: runnerIdentity(source),
    });
}
