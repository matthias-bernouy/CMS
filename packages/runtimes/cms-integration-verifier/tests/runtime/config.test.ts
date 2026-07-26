import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    IntegrationVerifierCredentialError,
    readIntegrationVerifierExecutableEnv,
    readIntegrationVerifierRuntimeEnv,
    readIntegrationVerifierWorkerToken,
} from "../../src";

const temporaryDirectories: string[] = [];

afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await Promise.all(temporaryDirectories.splice(0).map(async (path) => await rm(path, { recursive: true })));
});

describe("integration verifier runtime configuration", () => {
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

    test("requires an explicit provider, process command, and digest-pinned runner for the executable", () => {
        const source = {
            CMS_INTEGRATION_VERIFIER_REPOSITORY_URL: "http://repository.internal",
            CMS_INTEGRATION_VERIFIER_WORKER_ID: "worker-1",
            CMS_INTEGRATION_VERIFIER_DATABASE_PROVIDER_MODULE: "/opt/verifier/provider.js",
            CMS_INTEGRATION_VERIFIER_SANDBOX_EXECUTABLE: "/opt/verifier/runner",
            CMS_INTEGRATION_VERIFIER_SANDBOX_ARGUMENTS_JSON: '["--stdio"]',
            CMS_INTEGRATION_VERIFIER_RUNNER_NAME: "cms-postgres",
            CMS_INTEGRATION_VERIFIER_RUNNER_VERSION: "1.2.3",
            CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
        };

        expect(readIntegrationVerifierExecutableEnv(source)).toMatchObject({
            databaseProviderModule: "/opt/verifier/provider.js",
            sandboxExecutable: "/opt/verifier/runner",
            sandboxArguments: ["--stdio"],
            runnerIdentity: { name: "cms-postgres", version: "1.2.3" },
        });
        expect(() =>
            readIntegrationVerifierExecutableEnv({
                ...source,
                CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST: undefined,
            }),
        ).toThrow(/digest-pinned/);
        expect(() =>
            readIntegrationVerifierExecutableEnv({
                ...source,
                CMS_INTEGRATION_VERIFIER_SANDBOX_ARGUMENTS_JSON: '["--stdio",]',
            }),
        ).toThrow(/strict bounded JSON/);
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
