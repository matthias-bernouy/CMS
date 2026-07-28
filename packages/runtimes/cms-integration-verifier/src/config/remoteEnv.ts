import type { PinnedVerificationRunnerIdentity } from "@bernouy/cms-integration-verification";
import { absolutePath, boundedInteger, repositoryOrigin, runnerIdentity } from "./values";
import { readIntegrationVerifierRuntimeEnv, type IntegrationVerifierRuntimeEnv } from "./runtimeEnv";

export type IntegrationVerifierRemoteSandboxEnv = IntegrationVerifierRuntimeEnv &
    Readonly<{
        sandboxOrigin: string;
        sandboxSigningKeyFile: string;
        sandboxCapabilityLifetimeMs: number;
        sandboxTimeoutMs: number;
        sandboxMaxInputBytes: number;
        sandboxMaxOutputBytes: number;
        runnerIdentity: PinnedVerificationRunnerIdentity;
        healthPort: number;
    }>;

export function readIntegrationVerifierRemoteSandboxEnv(
    source: Record<string, string | undefined>,
): IntegrationVerifierRemoteSandboxEnv {
    return Object.freeze({
        ...readIntegrationVerifierRuntimeEnv(source),
        sandboxOrigin: repositoryOriginNamed(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_URL,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_URL",
        ),
        sandboxSigningKeyFile: absolutePath(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_SIGNING_KEY_FILE,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_SIGNING_KEY_FILE",
        ),
        sandboxCapabilityLifetimeMs: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_CAPABILITY_LIFETIME_MS,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_CAPABILITY_LIFETIME_MS",
            15_000,
            1_000,
            30_000,
        ),
        sandboxTimeoutMs: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_TIMEOUT_MS,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_TIMEOUT_MS",
            600_000,
            1_000,
            3_600_000,
        ),
        sandboxMaxInputBytes: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_INPUT_BYTES,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_INPUT_BYTES",
            40 * 1_048_576,
            1_048_576,
            64 * 1_048_576,
        ),
        sandboxMaxOutputBytes: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_OUTPUT_BYTES,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_OUTPUT_BYTES",
            1_048_576,
            1_024,
            4 * 1_048_576,
        ),
        runnerIdentity: runnerIdentity(source),
        healthPort: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_HEALTH_PORT,
            "CMS_INTEGRATION_VERIFIER_HEALTH_PORT",
            3_100,
            1,
            65_535,
        ),
    });
}

function repositoryOriginNamed(raw: string | undefined, name: string): string {
    try {
        return repositoryOrigin(raw);
    } catch {
        throw new Error(`${name} must be an HTTP origin without credentials`);
    }
}
