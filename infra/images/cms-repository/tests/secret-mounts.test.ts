import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import {
    dockerSecretMountSmokeAvailable,
    ownership,
    postgresProbeImage,
    probeImage,
    productionSecretEnvironment,
    replaceSecret,
    runService,
    setNumericOwners,
} from "./secretMountSupport";

const dockerTest = dockerSecretMountSmokeAvailable() ? test : test.skip;

dockerTest(
    "file-backed secret copies are readable by every isolated runtime UID",
    () => {
        const fixtureRoot = mkdtempSync(join(tmpdir(), "cms-repository-secret-mounts-"));
        const composeFile = resolve(import.meta.dir, "secret-mounts.compose.yml");
        const productionComposeFile = resolve(import.meta.dir, "..", "compose.yml");
        const projectName = basename(fixtureRoot)
            .toLowerCase()
            .replaceAll(/[^a-z0-9_-]/g, "");
        const secretPaths = {
            repositoryWorker: join(fixtureRoot, "repository-worker"),
            verifierWorker: join(fixtureRoot, "verifier-worker"),
            verifierDatabase: join(fixtureRoot, "verifier-database"),
            postgresDatabase: join(fixtureRoot, "postgres-database"),
        };
        const composeEnvironment = {
            PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
            PROBE_IMAGE: probeImage,
            POSTGRES_PROBE_IMAGE: postgresProbeImage,
            REPOSITORY_WORKER_SECRET_FILE: secretPaths.repositoryWorker,
            VERIFIER_WORKER_SECRET_FILE: secretPaths.verifierWorker,
            VERIFIER_DATABASE_SECRET_FILE: secretPaths.verifierDatabase,
            POSTGRES_DATABASE_SECRET_FILE: secretPaths.postgresDatabase,
        };
        const productionEnvironment = productionSecretEnvironment(composeEnvironment, secretPaths);

        try {
            writeFileSync(secretPaths.repositoryWorker, "shared-worker-token", { mode: 0o600 });
            writeFileSync(secretPaths.verifierWorker, "shared-worker-token", { mode: 0o600 });
            writeFileSync(secretPaths.verifierDatabase, "shared-database-password", { mode: 0o600 });
            writeFileSync(secretPaths.postgresDatabase, "shared-database-password", { mode: 0o600 });
            setNumericOwners(fixtureRoot);

            expect(ownership(secretPaths.repositoryWorker)).toEqual({ uid: 1000, gid: 1000, mode: 0o600 });
            expect(ownership(secretPaths.verifierWorker)).toEqual({ uid: 1001, gid: 1001, mode: 0o600 });
            expect(ownership(secretPaths.verifierDatabase)).toEqual({ uid: 1001, gid: 1001, mode: 0o600 });
            expect(ownership(secretPaths.postgresDatabase)).toEqual({ uid: 70, gid: 70, mode: 0o600 });

            const preflight = runService(
                "cms-repository-secret-check",
                productionComposeFile,
                `${projectName}-production`,
                fixtureRoot,
                productionEnvironment,
            );
            expect(preflight.exitCode, preflight.stderr.toString()).toBe(0);
            for (const service of ["repository", "verifier", "postgres", "wrong-user"] as const) {
                const result = runService(service, composeFile, projectName, fixtureRoot, composeEnvironment);
                expect(result.exitCode, result.stderr.toString()).toBe(0);
            }

            replaceSecret(fixtureRoot, "verifier-worker", "divergent-worker-token");
            assertPreflightRejects(
                productionComposeFile,
                `${projectName}-production`,
                fixtureRoot,
                productionEnvironment,
                "divergent-worker-token",
            );
            replaceSecret(fixtureRoot, "verifier-worker", "shared-worker-token");
            replaceSecret(fixtureRoot, "postgres-database", "divergent-database-password");
            assertPreflightRejects(
                productionComposeFile,
                `${projectName}-production`,
                fixtureRoot,
                productionEnvironment,
                "divergent-database-password",
            );
        } finally {
            Bun.spawnSync({
                cmd: [
                    "docker",
                    "compose",
                    "--project-name",
                    projectName,
                    "-f",
                    composeFile,
                    "down",
                    "--remove-orphans",
                ],
                cwd: fixtureRoot,
                env: composeEnvironment,
                stdout: "ignore",
                stderr: "ignore",
            });
            rmSync(fixtureRoot, { recursive: true, force: true });
        }
    },
    30_000,
);

function assertPreflightRejects(
    composeFile: string,
    projectName: string,
    cwd: string,
    env: Record<string, string>,
    secret: string,
): void {
    const rejected = runService("cms-repository-secret-check", composeFile, projectName, cwd, env);
    expect(rejected.exitCode).not.toBe(0);
    expect(`${rejected.stdout.toString()}${rejected.stderr.toString()}`).not.toContain(secret);
}
