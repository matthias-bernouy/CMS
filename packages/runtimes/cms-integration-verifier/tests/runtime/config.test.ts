import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    IntegrationVerifierCredentialError,
    readIntegrationVerifierRemoteSandboxEnv,
    readIntegrationVerifierRuntimeEnv,
    readIntegrationVerifierWorkerToken,
    readVerificationSandboxServiceEnv,
} from "../../src";
import { runIntegrationVerifierExecutable } from "../../src/runtime/main";

const temporaryDirectories: string[] = [];

afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await Promise.all(temporaryDirectories.splice(0).map(async (path) => await rm(path, { recursive: true })));
});

describe("integration verifier runtime configuration", () => {
    test("requires the isolated sandbox service", async () => {
        await expect(runIntegrationVerifierExecutable({ NODE_ENV: "production" })).rejects.toThrow(
            /isolated remote sandbox service/,
        );
    });

    test("requires an origin, stable worker identity, and secret-file-only authentication", () => {
        const parsed = readIntegrationVerifierRuntimeEnv({
            CMS_INTEGRATION_VERIFIER_REPOSITORY_URL: "https://repository.internal",
            CMS_INTEGRATION_VERIFIER_WORKER_ID: "worker-eu-1",
            CMS_INTEGRATION_VERIFIER_WORKER_TOKEN_FILE: "/run/secrets/worker",
        });

        expect(parsed.repositoryUrl).toBe("https://repository.internal");
        expect(parsed.workerTokenFile).toBe("/run/secrets/worker");
        expect(parsed.maxResponseBytes).toBe(40 * 1_048_576);
        expect(parsed.pollIntervalMs).toBe(5_000);
        expect(() =>
            readIntegrationVerifierRuntimeEnv({
                CMS_INTEGRATION_VERIFIER_REPOSITORY_URL: "https://token@repository.internal/path",
                CMS_INTEGRATION_VERIFIER_WORKER_ID: "worker-eu-1",
            }),
        ).toThrow(/HTTP origin without credentials/);
        expect(() =>
            readIntegrationVerifierRuntimeEnv({
                CMS_INTEGRATION_VERIFIER_REPOSITORY_URL: "https://repository.internal",
                CMS_INTEGRATION_VERIFIER_WORKER_ID: "worker-eu-1",
                CMS_INTEGRATION_VERIFIER_WORKER_TOKEN: "forbidden",
            }),
        ).toThrow(/secret file/);
    });

    test("rejects invalid numeric controls instead of silently coercing them", () => {
        const source = {
            CMS_INTEGRATION_VERIFIER_REPOSITORY_URL: "http://repository.internal",
            CMS_INTEGRATION_VERIFIER_WORKER_ID: "worker-1",
        };
        expect(() =>
            readIntegrationVerifierRuntimeEnv({
                ...source,
                CMS_INTEGRATION_VERIFIER_REQUEST_TIMEOUT_MS: "1e3",
            }),
        ).toThrow(/integer/);
        expect(() =>
            readIntegrationVerifierRuntimeEnv({
                ...source,
                CMS_INTEGRATION_VERIFIER_JOB_LIST_LIMIT: "101",
            }),
        ).toThrow(/between 1 and 100/);
    });

    test("separates supervisor-only signing configuration from the sandbox service", () => {
        const common = {
            CMS_INTEGRATION_VERIFIER_RUNNER_NAME: "cms-postgres",
            CMS_INTEGRATION_VERIFIER_RUNNER_VERSION: "1.0.0",
            CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
            CMS_INTEGRATION_VERIFIER_SANDBOX_TIMEOUT_MS: "600000",
            CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_INPUT_BYTES: "41943040",
            CMS_INTEGRATION_VERIFIER_SANDBOX_MAX_OUTPUT_BYTES: "1048576",
        };
        const supervisor = readIntegrationVerifierRemoteSandboxEnv({
            ...common,
            CMS_INTEGRATION_VERIFIER_REPOSITORY_URL: "http://cms-repository:3000",
            CMS_INTEGRATION_VERIFIER_WORKER_ID: "worker-1",
            CMS_INTEGRATION_VERIFIER_SANDBOX_URL: "http://sandbox:3101",
            CMS_INTEGRATION_VERIFIER_SANDBOX_SIGNING_KEY_FILE: "/run/secrets/private-key",
        });
        expect(supervisor.sandboxSigningKeyFile).toBe("/run/secrets/private-key");

        const sandbox = readVerificationSandboxServiceEnv({
            ...common,
            CMS_INTEGRATION_VERIFIER_SANDBOX_VERIFICATION_KEY_FILE: "/run/configs/public-key",
            CMS_INTEGRATION_VERIFIER_SANDBOX_EXECUTABLE: "/usr/local/bin/bun",
        });
        expect(sandbox.verificationKeyFile).toBe("/run/configs/public-key");
        expect(sandbox).not.toHaveProperty("repositoryUrl");
        expect(sandbox).not.toHaveProperty("workerTokenFile");

        expect(() =>
            readVerificationSandboxServiceEnv({
                ...common,
                CMS_INTEGRATION_VERIFIER_DEPLOYED_IMAGE_REFERENCE: `registry.test/verifier@sha256:${"b".repeat(64)}`,
                CMS_INTEGRATION_VERIFIER_SANDBOX_VERIFICATION_KEY_FILE: "/run/configs/public-key",
                CMS_INTEGRATION_VERIFIER_SANDBOX_EXECUTABLE: "/usr/local/bin/bun",
            }),
        ).toThrow(/digest-pinned/);
    });
});

describe("integration verifier credential file", () => {
    test("reads one bounded regular token without retaining its trailing newline", async () => {
        const directory = await temporaryDirectory();
        const tokenFile = join(directory, "worker-token");
        await writeFile(tokenFile, "worker-secret-token\n", { mode: 0o400 });

        await expect(readIntegrationVerifierWorkerToken(tokenFile)).resolves.toBe("worker-secret-token");
    });

    test("rejects symlinks, whitespace-bearing tokens, and oversized files", async () => {
        const directory = await temporaryDirectory();
        const target = join(directory, "target");
        const link = join(directory, "link");
        await writeFile(target, "secret");
        await symlink(target, link);
        await expect(readIntegrationVerifierWorkerToken(link)).rejects.toBeInstanceOf(
            IntegrationVerifierCredentialError,
        );

        const spaced = join(directory, "spaced");
        await writeFile(spaced, "two tokens");
        await expect(readIntegrationVerifierWorkerToken(spaced)).rejects.toThrow(/one non-empty Bearer token/);

        const oversized = join(directory, "oversized");
        await writeFile(oversized, "x".repeat(8_193));
        await expect(readIntegrationVerifierWorkerToken(oversized)).rejects.toThrow(/bounded regular file/);
    });
});

async function temporaryDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), "cms-integration-verifier-"));
    temporaryDirectories.push(directory);
    return directory;
}
