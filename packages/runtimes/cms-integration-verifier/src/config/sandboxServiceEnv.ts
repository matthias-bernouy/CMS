import type { PinnedVerificationRunnerIdentity } from "@bernouy/cms-integration-verification";
import { absolutePath, boundedInteger, runnerIdentity } from "./values";

export type VerificationSandboxServiceEnv = Readonly<{
    port: number;
    verificationKeyFile: string;
    tempRoot: string;
    timeoutMs: number;
    terminationGraceMs: number;
    maxInputBytes: number;
    maxOutputBytes: number;
    maxErrorBytes: number;
    runnerIdentity: PinnedVerificationRunnerIdentity;
}>;

export function readVerificationSandboxServiceEnv(
    source: Record<string, string | undefined>,
): VerificationSandboxServiceEnv {
    return Object.freeze({
        port: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_PORT,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_PORT",
            3_101,
            1,
            65_535,
        ),
        verificationKeyFile: absolutePath(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_VERIFICATION_KEY_FILE,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_VERIFICATION_KEY_FILE",
        ),
        tempRoot: absolutePath(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_TMP_ROOT,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_TMP_ROOT",
            "/tmp/cms-integration-verifier",
        ),
        timeoutMs: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_TIMEOUT_MS,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_TIMEOUT_MS",
            600_000,
            1_000,
            3_600_000,
        ),
        terminationGraceMs: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_TERMINATION_GRACE_MS,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_TERMINATION_GRACE_MS",
            2_000,
            10,
            30_000,
        ),
        maxInputBytes: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_INPUT_BYTES,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_INPUT_BYTES",
            40 * 1_048_576,
            1_048_576,
            64 * 1_048_576,
        ),
        maxOutputBytes: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_OUTPUT_BYTES,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_OUTPUT_BYTES",
            1_048_576,
            1_024,
            4 * 1_048_576,
        ),
        maxErrorBytes: boundedInteger(
            source.CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_ERROR_BYTES,
            "CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_ERROR_BYTES",
            65_536,
            1_024,
            1_048_576,
        ),
        runnerIdentity: runnerIdentity(source),
    });
}
