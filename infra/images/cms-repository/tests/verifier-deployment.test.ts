import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const composeFile = resolve(root, "compose.yml");
const compose = readFileSync(composeFile, "utf8");
const dockerfile = readFileSync(resolve(root, "Verifier.Dockerfile"), "utf8");
const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
const postgresInit = readFileSync(resolve(root, "verifier-postgres-init.sql"), "utf8");

describe("integration verifier image", () => {
    test("pins every external base and installs only the verifier runtime dependency closure", () => {
        const bases = Array.from(dockerfile.matchAll(/^FROM\s+(\S+)/gim), (match) => match[1]).filter(
            (image) => !["build", "runtime-source"].includes(image),
        );
        expect(bases).toEqual([
            `oven/bun:1.3.14-alpine@sha256:${"5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0"}`,
            `docker:28.5.2-cli-alpine3.22@sha256:${"625d9431a9f54c5a2bc90f24f0e1c3d55b1349fd857dd85035f98c2c9acbdd4d"}`,
            `oven/bun:1.3.14-slim@sha256:${"d56a2534ffd262e92c12fd3249d3924d296d97086da773f821d7d0477435ea04"}`,
        ]);
        expect(dockerfile).toContain("--filter=@bernouy/cms-integration-verifier");
        expect(dockerfile).toContain("-u 1001");
        expect(dockerfile).toContain("-u 1002");
        expect(dockerfile).not.toContain("docker.sock");
    });
});

describe("integration verifier trust zones", () => {
    test("compares duplicated multi-UID secrets in an isolated one-shot preflight", () => {
        const checker = serviceSource("cms-repository-secret-check", "cms-repository");
        expect(checker).toContain('user: "0:0"');
        expect(checker).toContain("network_mode: none");
        expect(checker).toContain('restart: "no"');
        expect(checker).toMatch(/cap_drop:\n\s+- ALL/);
        expect(checker).toMatch(/cap_add:\n\s+- DAC_READ_SEARCH/);
        expect(checker).toContain("no-new-privileges:true");
        expect(checker).toContain("timingSafeEqual");
        expect(checker).not.toMatch(/console\.|stdout|stderr/);
    });

    test("keeps the supervisor credential out of the fixed sandbox", () => {
        const supervisor = serviceSource("cms-integration-verifier", "cms-integration-verifier-sandbox");
        const sandbox = serviceSource("cms-integration-verifier-sandbox", "cms-integration-verifier-postgres");
        expect(supervisor).toContain("cms_repository: {}");
        expect(supervisor).toContain("cms_verifier_control: {}");
        expect(supervisor).toContain("cms_verifier_database: {}");
        expect(supervisor).toContain("CMS_INTEGRATION_VERIFIER_WORKER_TOKEN_FILE: /run/secrets/");
        expect(supervisor).toContain("CMS_INTEGRATION_VERIFIER_SANDBOX_SIGNING_KEY_FILE: /run/secrets/");
        expect(sandbox).not.toContain("cms_repository");
        expect(sandbox).not.toContain("WORKER_TOKEN");
        expect(sandbox).not.toContain("SIGNING_KEY");
        expect(sandbox).toContain("SANDBOX_VERIFICATION_KEY_FILE: /run/configs/");
        expect(sandbox).toContain("CMS_INTEGRATION_VERIFIER_DEPLOYED_IMAGE_REFERENCE:");
        expect(sandbox).toContain("cms_verifier_control: {}");
        expect(sandbox).toContain("cms_verifier_database: {}");
    });

    test("runs a fixed, bounded sandbox because production has no Docker control socket", () => {
        const sandbox = serviceSource("cms-integration-verifier-sandbox", "cms-integration-verifier-postgres");
        expect(compose).not.toContain("/var/run/docker.sock");
        expect(sandbox).toContain("read_only: true");
        expect(sandbox).toMatch(/cap_drop:\n\s+- ALL/);
        expect(sandbox).toContain("no-new-privileges:true");
        expect(sandbox).toContain("pids_limit: 128");
        expect(sandbox).toContain("mem_limit: 1g");
        expect(sandbox).toContain('cpus: "2.0"');
        expect(sandbox).toContain("size=256m");
        expect(sandbox).toContain("SANDBOX_TIMEOUT_MS");
        expect(sandbox).toContain("SANDBOX_MAX_OUTPUT_BYTES");
        expect(sandbox).toContain("SANDBOX_MAX_ERROR_BYTES");
        expect(sandbox).not.toContain("SANDBOX_EXECUTABLE");
        expect(sandbox).not.toContain("SANDBOX_ARGUMENTS_JSON");
        expect(sandbox).toContain('CMS_INTEGRATION_VERIFIER_RUNNER_VERSION: "1.3.0"');
        expect(sandbox).not.toContain("service/postgresAdapter.ts");
        expect(sandbox).not.toContain('"platform-install"');
    });

    test("gives the full-stack runner only a private disposable Docker daemon", () => {
        const docker = serviceSource("cms-integration-release-runtime-docker", "cms-integration-release-runtime");
        const runtime = serviceSource("cms-integration-release-runtime");
        expect(compose).not.toContain("/var/run/docker.sock");
        expect(docker).toContain(
            `docker:28.5.2-dind-alpine3.22@sha256:${"2a232a42256f70d78e3cc5d2b5d6b3276710a0de0596c145f627ecfae90282ac"}`,
        );
        expect(docker).toContain("cms_release_runtime_egress: {}");
        expect(docker).not.toContain("cms_repository");
        expect(runtime).toContain("network_mode: service:cms-integration-release-runtime-docker");
        expect(runtime).toContain("DOCKER_HOST: tcp://127.0.0.1:2375");
        expect(runtime).toContain("releaseMain.ts");
        expect(runtime).not.toContain("WORKER_TOKEN");
        expect(runtime).not.toContain("SIGNING_KEY");
    });

    test("uses an ephemeral digest-pinned PostgreSQL 16 provider on its own network", () => {
        const postgres = serviceSource("cms-integration-verifier-postgres", "cms-integration-release-runtime-docker");
        expect(postgres).toContain(
            "postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777",
        );
        expect(postgres).toContain("/var/lib/postgresql/data:rw,nosuid,nodev,noexec,size=1g");
        expect(postgres).not.toMatch(/^\s+volumes:/m);
        expect(postgres).toContain("cms_verifier_database: {}");
        expect(postgres).not.toContain("cms_repository");
        expect(postgres).toContain("read_only: true");
        expect(postgres).toContain("pids_limit: 128");
        expect(postgres).toContain("source: cms_integration_verifier_postgres_init");
        expect(postgres).toContain("/docker-entrypoint-initdb.d/010-cms-verifier-contract.sql");
        expect(postgresInit.trim()).toBe(
            "COMMENT ON DATABASE postgres IS 'cms-integration-verifier-dedicated-postgres-v1';",
        );
        expect(compose).toContain("file: ./verifier-postgres-init.sql");
        expect(compose).toContain("CMS_INTEGRATION_VERIFIER_POSTGRES_LEASE_DURATION_MS");
        expect(compose).toContain("CMS_INTEGRATION_VERIFIER_POSTGRES_HEARTBEAT_INTERVAL_MS");
        expect(envExample).toContain("CMS_INTEGRATION_VERIFIER_POSTGRES_LEASE_DURATION_MS=30000");
        expect(envExample).toContain("CMS_INTEGRATION_VERIFIER_POSTGRES_HEARTBEAT_INTERVAL_MS=5000");
    });

    test("requires file-backed worker, signing, and database credentials", () => {
        expect(envExample).toContain("CMS_REPOSITORY_WORKER_TOKEN_SECRET_FILE=");
        expect(envExample).toContain("CMS_INTEGRATION_VERIFIER_WORKER_TOKEN_SECRET_FILE=");
        expect(envExample).toContain("CMS_INTEGRATION_VERIFIER_SANDBOX_SIGNING_KEY_SECRET_FILE=");
        expect(envExample).toContain("CMS_INTEGRATION_VERIFIER_SANDBOX_VERIFICATION_KEY_FILE=");
        expect(envExample).toContain("CMS_INTEGRATION_RELEASE_RUNTIME_SIGNING_KEY_SECRET_FILE=");
        expect(envExample).toContain("CMS_INTEGRATION_RELEASE_RUNTIME_VERIFICATION_KEY_FILE=");
        expect(envExample).toContain("CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_SECRET_FILE=");
        expect(envExample).toContain("CMS_INTEGRATION_VERIFIER_POSTGRES_SERVER_PASSWORD_SECRET_FILE=");
        expect(compose).toContain("source: cms_integration_verifier_worker_token");
        expect(compose).toContain("source: cms_integration_verifier_postgres_server_password");
        expect(compose).not.toMatch(/^\s+(?:uid|gid|mode):/m);
        expect(compose).not.toMatch(/^\s+CMS_INTEGRATION_VERIFIER_WORKER_TOKEN:/m);
        expect(compose).not.toMatch(/^\s+CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD:/m);
    });
});

const dockerComposeAvailable =
    Bun.spawnSync({ cmd: ["docker", "compose", "version"], stdout: "ignore", stderr: "ignore" }).exitCode === 0;
const composeTest = dockerComposeAvailable ? test : test.skip;

composeTest("renders exact network membership, identities, secrets, and resource controls", () => {
    const rendered = Bun.spawnSync({
        cmd: ["docker", "compose", "--env-file", "/dev/null", "-f", composeFile, "config", "--format", "json"],
        cwd: root,
        env: renderEnvironment(),
        stdout: "pipe",
        stderr: "pipe",
    });
    expect(rendered.exitCode, rendered.stderr.toString()).toBe(0);
    const config = JSON.parse(rendered.stdout.toString()) as {
        services: Record<string, Record<string, unknown>>;
        networks: Record<string, { internal?: boolean }>;
    };
    const supervisor = config.services["cms-integration-verifier"]!;
    const sandbox = config.services["cms-integration-verifier-sandbox"]!;
    const releaseDocker = config.services["cms-integration-release-runtime-docker"]!;
    const releaseRuntime = config.services["cms-integration-release-runtime"]!;
    const postgres = config.services["cms-integration-verifier-postgres"]!;
    const repository = config.services["cms-repository"]!;
    const secretCheck = config.services["cms-repository-secret-check"]!;
    expect(secretCheck).toMatchObject({
        user: "0:0",
        restart: "no",
        read_only: true,
        network_mode: "none",
        cap_add: ["DAC_READ_SEARCH"],
        cap_drop: ["ALL"],
        healthcheck: { disable: true },
    });
    expect(secretCheck).not.toHaveProperty("ports");
    expect(secretCheck).not.toHaveProperty("networks");
    expect(supervisor.user).toBe("1001:1001");
    expect(sandbox.user).toBe("1002:1002");
    expect(postgres.user).toBe("70:70");
    expect(releaseRuntime.user).toBe("1002:1002");
    expect(releaseRuntime.network_mode).toBe("service:cms-integration-release-runtime-docker");
    expect(releaseDocker.privileged).toBeTrue();
    for (const service of [repository, supervisor, sandbox, releaseRuntime]) {
        expect(service.environment).toMatchObject({
            CMS_INTEGRATION_VERIFIER_RUNNER_NAME: "cms-postgres",
            CMS_INTEGRATION_VERIFIER_RUNNER_VERSION: "1.3.0",
            CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST: `sha256:${"b".repeat(64)}`,
        });
    }
    expect(supervisor.secrets).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ source: "cms_integration_verifier_worker_token" }),
            expect.objectContaining({ source: "cms_integration_verifier_postgres_password" }),
        ]),
    );
    expect(postgres.secrets).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ source: "cms_integration_verifier_postgres_server_password" }),
        ]),
    );
    expect(
        (supervisor.depends_on as Record<string, { condition?: string }>)["cms-repository-secret-check"],
    ).toMatchObject({ condition: "service_completed_successfully" });
    expect(
        (postgres.depends_on as Record<string, { condition?: string }>)["cms-repository-secret-check"],
    ).toMatchObject({ condition: "service_completed_successfully" });
    for (const secret of [...(supervisor.secrets as object[]), ...(postgres.secrets as object[])]) {
        expect(secret).not.toHaveProperty("uid");
        expect(secret).not.toHaveProperty("gid");
        expect(secret).not.toHaveProperty("mode");
    }
    expect(Object.keys(supervisor.networks as object).toSorted()).toEqual([
        "cms_repository",
        "cms_verifier_control",
        "cms_verifier_database",
    ]);
    expect(Object.keys(sandbox.networks as object).toSorted()).toEqual([
        "cms_verifier_control",
        "cms_verifier_database",
    ]);
    expect(Object.keys(postgres.networks as object)).toEqual(["cms_verifier_database"]);
    expect(
        Object.keys(sandbox.networks as object).filter((network) =>
            Object.hasOwn(config.services["cms-repository"]!.networks as object, network),
        ),
    ).toEqual([]);
    expect(sandbox).not.toHaveProperty("secrets");
    expect(sandbox).not.toHaveProperty("volumes");
    expect(sandbox).not.toHaveProperty("ports");
    expect(supervisor).not.toHaveProperty("ports");
    expect(postgres).not.toHaveProperty("ports");
    for (const [name, network] of Object.entries(config.networks)) {
        expect(network.internal ?? false).toBe(name.endsWith("cms_release_runtime_egress") ? false : true);
    }
    for (const service of [supervisor, sandbox, postgres]) {
        expect(service.restart).toBe("unless-stopped");
        expect(service).toHaveProperty("healthcheck");
    }
});

function serviceSource(name: string, next?: string): string {
    const start = new RegExp(`^    ${name}:`, "mu").exec(compose)?.index ?? -1;
    const end = next
        ? (new RegExp(`^    ${next}:`, "mu").exec(compose.slice(start + 1))?.index ?? -1) + start + 1
        : compose.indexOf("\nsecrets:", start + 1);
    if (start < 0 || end < 0) {
        throw new Error(`Compose service ${name} was not found`);
    }
    return compose.slice(start, end);
}

function renderEnvironment(): Record<string, string> {
    return {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        CMS_REPOSITORY_IMAGE: `registry.example.test/repository@sha256:${"a".repeat(64)}`,
        CMS_INTEGRATION_VERIFIER_IMAGE: `registry.example.test/verifier@sha256:${"b".repeat(64)}`,
        CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST: `sha256:${"b".repeat(64)}`,
        CMS_REPOSITORY_MANAGEMENT_TOKEN_SECRET_FILE: "/secrets/management",
        CMS_REPOSITORY_MAINTENANCE_TOKEN_SECRET_FILE: "/secrets/maintenance",
        CMS_REPOSITORY_WORKER_TOKEN_SECRET_FILE: "/secrets/worker",
        CMS_REPOSITORY_WORKER_CAPABILITY_KEY_SECRET_FILE: "/secrets/capability",
        CMS_INTEGRATION_VERIFIER_WORKER_TOKEN_SECRET_FILE: "/secrets/verifier-worker",
        CMS_INTEGRATION_VERIFIER_SANDBOX_SIGNING_KEY_SECRET_FILE: "/secrets/private.pem",
        CMS_INTEGRATION_VERIFIER_SANDBOX_VERIFICATION_KEY_FILE: "/secrets/public.pem",
        CMS_INTEGRATION_RELEASE_RUNTIME_SIGNING_KEY_SECRET_FILE: "/secrets/release-private.pem",
        CMS_INTEGRATION_RELEASE_RUNTIME_VERIFICATION_KEY_FILE: "/secrets/release-public.pem",
        CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_SECRET_FILE: "/secrets/postgres",
        CMS_INTEGRATION_VERIFIER_POSTGRES_SERVER_PASSWORD_SECRET_FILE: "/secrets/postgres-server",
    };
}
