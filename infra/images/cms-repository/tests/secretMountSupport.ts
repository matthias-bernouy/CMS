import { statSync } from "node:fs";

export const probeImage =
    "oven/bun:1.3.14-alpine@sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0";
export const postgresProbeImage =
    "postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777";

export function dockerSecretMountSmokeAvailable(): boolean {
    return (
        commandAvailable(["docker", "info"]) &&
        commandAvailable(["docker", "compose", "version"]) &&
        commandAvailable(["docker", "image", "inspect", probeImage]) &&
        commandAvailable(["docker", "image", "inspect", postgresProbeImage])
    );
}

export function productionSecretEnvironment(
    base: Record<string, string>,
    paths: Record<
        | "repositoryWorker"
        | "verifierWorker"
        | "releaseRuntimeSigningKey"
        | "sandboxVerificationKey"
        | "releaseRuntimeVerificationKey"
        | "verifierDatabase"
        | "postgresDatabase",
        string
    >,
): Record<string, string> {
    return {
        ...base,
        CMS_REPOSITORY_IMAGE: probeImage,
        CMS_INTEGRATION_VERIFIER_IMAGE: probeImage,
        CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST: `sha256:${"a".repeat(64)}`,
        CMS_REPOSITORY_MANAGEMENT_TOKEN_SECRET_FILE: paths.repositoryWorker,
        CMS_REPOSITORY_MAINTENANCE_TOKEN_SECRET_FILE: paths.repositoryWorker,
        CMS_REPOSITORY_WORKER_TOKEN_SECRET_FILE: paths.repositoryWorker,
        CMS_REPOSITORY_WORKER_CAPABILITY_KEY_SECRET_FILE: paths.repositoryWorker,
        CMS_INTEGRATION_VERIFIER_WORKER_TOKEN_SECRET_FILE: paths.verifierWorker,
        CMS_INTEGRATION_VERIFIER_SANDBOX_SIGNING_KEY_SECRET_FILE: paths.verifierWorker,
        CMS_INTEGRATION_RELEASE_RUNTIME_SIGNING_KEY_SECRET_FILE: paths.releaseRuntimeSigningKey,
        CMS_INTEGRATION_VERIFIER_SANDBOX_VERIFICATION_KEY_FILE: paths.sandboxVerificationKey,
        CMS_INTEGRATION_RELEASE_RUNTIME_VERIFICATION_KEY_FILE: paths.releaseRuntimeVerificationKey,
        CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_SECRET_FILE: paths.verifierDatabase,
        CMS_INTEGRATION_VERIFIER_POSTGRES_SERVER_PASSWORD_SECRET_FILE: paths.postgresDatabase,
    };
}

export function runService(
    service: string,
    composeFile: string,
    projectName: string,
    cwd: string,
    env: Record<string, string>,
) {
    return Bun.spawnSync({
        cmd: [
            "docker",
            "compose",
            "--env-file",
            "/dev/null",
            "--project-name",
            projectName,
            "-f",
            composeFile,
            "run",
            "--rm",
            "--no-deps",
            service,
        ],
        cwd,
        env,
        stdout: "pipe",
        stderr: "pipe",
    });
}

export function setNumericOwners(fixtureRoot: string): void {
    assertCommand([
        "docker",
        "run",
        "--rm",
        "--user",
        "0:0",
        "--volume",
        `${fixtureRoot}:/fixture`,
        "--entrypoint",
        "/bin/sh",
        probeImage,
        "-ec",
        [
            "chown 1000:1000 /fixture/repository-worker",
            "chown 1001:1001 /fixture/verifier-worker /fixture/release-runtime-signing-key /fixture/verifier-database",
            "chown 1002:1002 /fixture/sandbox-verification-key /fixture/release-runtime-verification-key",
            "chown 70:70 /fixture/postgres-database",
        ].join("\n"),
    ]);
}

export function replaceSecret(fixtureRoot: string, name: string, value: string): void {
    assertCommand([
        "docker",
        "run",
        "--rm",
        "--user",
        "0:0",
        "--volume",
        `${fixtureRoot}:/fixture`,
        "--entrypoint",
        "/bin/sh",
        probeImage,
        "-ec",
        'printf %s "$1" > "/fixture/$2"',
        "secret-writer",
        value,
        name,
    ]);
}

export function ownership(path: string): { uid: number; gid: number; mode: number } {
    const stat = statSync(path);
    return { uid: stat.uid, gid: stat.gid, mode: stat.mode & 0o777 };
}

function commandAvailable(cmd: string[]): boolean {
    return Bun.spawnSync({ cmd, stdout: "ignore", stderr: "ignore" }).exitCode === 0;
}

function assertCommand(cmd: string[]): void {
    const result = Bun.spawnSync({ cmd, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) {
        throw new Error(result.stderr.toString());
    }
}
