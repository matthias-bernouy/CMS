import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const imageRoot = resolve(import.meta.dir, "..");
const composeFile = resolve(imageRoot, "compose.yml");
const composeSource = readFileSync(composeFile, "utf8");
const dockerfileSource = readFileSync(resolve(imageRoot, "Dockerfile"), "utf8");
const envExampleSource = readFileSync(resolve(imageRoot, ".env.example"), "utf8");
const overrideSource = readFileSync(resolve(imageRoot, "management-cms.override.yml"), "utf8");
const readmeSource = readFileSync(resolve(imageRoot, "README.md"), "utf8");
const gitignoreSource = readFileSync(resolve(imageRoot, "../../..", ".gitignore"), "utf8");
const dockerignoreSource = readFileSync(resolve(imageRoot, "../../..", ".dockerignore"), "utf8");

describe("repository image", () => {
    test("uses a pinned Bun base and the repository runtime dependency closure", () => {
        const externalBases = Array.from(dockerfileSource.matchAll(/^FROM\s+(\S+)/gim), (match) => match[1]).filter(
            (image) => !["build", "runtime-source"].includes(image),
        );

        expect(externalBases).toHaveLength(2);
        for (const image of externalBases) {
            expect(image).toMatch(/^oven\/bun:1\.3\.14-alpine@sha256:[a-f0-9]{64}$/);
        }
        expect(dockerfileSource).toContain("--filter=@bernouy/cms-repository-server");
        expect(dockerfileSource).toContain("USER bun");
        expect(dockerfileSource).toContain("/var/lib/cms-repository/registry");
        expect(dockerfileSource).not.toMatch(/CMS_REPOSITORY_(?:(?:MANAGEMENT|MAINTENANCE)_)?TOKEN=/);
    });

    test("checks readiness on the internal management listener", () => {
        expect(dockerfileSource).toContain("CMS_REPOSITORY_MANAGEMENT_PORT");
        expect(dockerfileSource).toContain("/ready");
        expect(dockerfileSource).toContain("cms-repository-server/src/index.ts");
    });
});

describe("repository Compose isolation", () => {
    test("keeps both listeners off host and public proxy routing", () => {
        expect(composeSource).not.toMatch(/^\s+ports:/m);
        expect(composeSource).not.toContain("VIRTUAL_HOST");
        expect(composeSource).not.toContain("cms_proxy");
        expect(composeSource).toContain('            - "3000"');
        expect(composeSource).toContain('            - "3001"');
        expect(composeSource).toMatch(/cms_repository:\n\s+name:.*\n\s+internal: true/);
    });

    test("allows durable writes only on the dedicated registry volume", () => {
        expect(composeSource).toContain("read_only: true");
        expect(composeSource).toContain("source: ./registry");
        expect(composeSource).toContain("target: /var/lib/cms-repository/registry");
        expect(composeSource).toMatch(/bind:\n\s+create_host_path: false/);
        expect(composeSource).toContain("/tmp:rw,nosuid,nodev,noexec,size=64m,mode=1770,uid=1000,gid=1000");
        expect(composeSource).toContain("no-new-privileges:true");
        expect(composeSource).toMatch(/cap_drop:\n\s+- ALL/);
        expect(readmeSource).toContain("refuses to create `./registry`");
    });

    test("loads four distinct capability credentials from Docker secret files", () => {
        expect(composeSource).toContain("CMS_REPOSITORY_MANAGEMENT_TOKEN_FILE: /run/secrets/");
        expect(composeSource).toContain("CMS_REPOSITORY_MAINTENANCE_TOKEN_FILE: /run/secrets/");
        expect(composeSource).toContain("CMS_REPOSITORY_WORKER_TOKEN_FILE: /run/secrets/");
        expect(composeSource).toContain("CMS_REPOSITORY_WORKER_CAPABILITY_KEY_FILE: /run/secrets/");
        expect(composeSource).toContain("CMS_REPOSITORY_MANAGEMENT_TOKEN_SECRET_FILE");
        expect(composeSource).toContain("CMS_REPOSITORY_MAINTENANCE_TOKEN_SECRET_FILE");
        expect(composeSource).toContain("CMS_REPOSITORY_WORKER_TOKEN_SECRET_FILE");
        expect(composeSource).toContain("CMS_REPOSITORY_WORKER_CAPABILITY_KEY_SECRET_FILE");
        expect(composeSource).not.toMatch(/^\s+(?:uid|gid|mode):/m);
        expect(overrideSource).not.toMatch(/^\s+(?:uid|gid|mode):/m);
        expect(envExampleSource).not.toMatch(/^CMS_REPOSITORY_MANAGEMENT_TOKEN=/m);
        expect(envExampleSource).not.toMatch(/^CMS_REPOSITORY_MAINTENANCE_TOKEN=/m);
        expect(envExampleSource).not.toMatch(/^CMS_REPOSITORY_WORKER_TOKEN=/m);
        expect(envExampleSource).not.toMatch(/^CMS_REPOSITORY_WORKER_CAPABILITY_KEY=/m);
        expect(`${composeSource}\n${envExampleSource}`).not.toMatch(/READ_TOKEN|REPOSITORY_TOKEN=/);
        expect(overrideSource).not.toContain("cms_repository_worker_token");
        expect(overrideSource).not.toContain("cms_repository_worker_capability_key");
        expect(gitignoreSource).toContain("/infra/images/cms-repository/secrets/");
        expect(dockerignoreSource).toContain("infra/images/cms-repository/secrets/");
    });

    test("does not reject standard internal CMS fetches that have no forwarding chain", () => {
        expect(composeSource).toContain("CMS_HTTP_CLIENT_ADDRESS_MODE: ${CMS_HTTP_CLIENT_ADDRESS_MODE:-disabled}");
        expect(composeSource).toContain('CMS_HTTP_TRUSTED_PROXY_HOPS: "${CMS_HTTP_TRUSTED_PROXY_HOPS:-0}"');
        expect(composeSource).toContain("CMS_INTEGRATION_PACKAGE_DOWNLOAD_LIMIT");
        expect(envExampleSource).toContain("CMS_HTTP_CLIENT_ADDRESS_MODE=disabled");
        expect(envExampleSource).toContain("CMS_HTTP_TRUSTED_PROXY_HOPS=0");
        expect(readmeSource).toContain("reject every normal CMS fetch as an invalid forwarding chain");
    });

    test("provides an explicit internal-network attachment for the management CMS", () => {
        expect(overrideSource).toContain("cms_repository_management_token");
        expect(overrideSource).not.toContain("cms_repository_maintenance_token");
        expect(overrideSource).toContain("CMS_REPOSITORY_MANAGEMENT_TOKEN_SECRET_FILE");
        expect(overrideSource).toContain("P9R_INTEGRATION_REPOSITORY_URL: http://cms-repository:3001/.cms/repository");
        expect(overrideSource).toContain(
            "P9R_INTEGRATION_REPOSITORY_MANAGEMENT_URL: http://cms-repository:3000/.cms/repository-management",
        );
        expect(overrideSource).toContain(
            "P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TOKEN_FILE: /run/secrets/cms-repository-management-token",
        );
        expect(overrideSource).toContain("P9R_INTEGRATION_REPOSITORY_ADMIN_SUBJECT_IDENTIFIER");
        expect(overrideSource).toMatch(/cms_repository:\n\s+external: true/);
        expect(overrideSource).not.toContain("3000:");
        expect(readmeSource).toMatch(/stable\s+opaque user `sub`/);
    });
});

describe("registry lifecycle documentation", () => {
    test("prepares the complete digest-pinned verifier trust chain", () => {
        expect(readmeSource).toContain("Verifier.Dockerfile");
        expect(readmeSource).toContain("CMS_INTEGRATION_VERIFIER_IMAGE");
        expect(readmeSource).toContain("CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST");
        expect(readmeSource).toContain("verifier-sandbox-ed25519-private.pem");
        expect(readmeSource).toContain("verifier-sandbox-ed25519-public.pem");
        expect(readmeSource).toContain("verifier-worker-token");
        expect(readmeSource).toContain("verifier-postgres-server-password");
        expect(readmeSource).toContain("`REPOSITORY_MAINTENANCE_TOKEN`");
        expect(readmeSource).toContain("sudo chown 1001:1001");
        expect(readmeSource).toContain("sudo chown 70:70");
        expect(readmeSource).toContain("sudo chown 1002:1002");
    });

    test("documents empty-only bootstrap and image-upgrade immutability", () => {
        expect(readmeSource).toMatch(/closed historical bootstrap\s+set of 14 official packages/);
        expect(readmeSource).toMatch(
            /First publish[\s\S]*documentation-blocs@1\.0\.0[\s\S]*Then deploy[\s\S]*cms-repository-hub/,
        );
        expect(readmeSource).toContain(".official-bootstrap-in-progress");
        expect(readmeSource).toContain("every later startup fails closed");
        expect(readmeSource).toContain("Any non-empty registry without that marker is already initialized");
        expect(readmeSource).toContain("image upgrades never reconcile or mutate registry contents");
        expect(readmeSource).toContain("Public reads have no token");
        expect(readmeSource).toContain("last valid snapshot stays available");
    });
});

const dockerComposeAvailable =
    Bun.spawnSync({ cmd: ["docker", "compose", "version"], stdout: "ignore", stderr: "ignore" }).exitCode === 0;
const composeTest = dockerComposeAvailable ? test : test.skip;

composeTest("Compose renders the isolated repository and verifier trust zones without published ports", () => {
    const rendered = Bun.spawnSync({
        cmd: ["docker", "compose", "--env-file", "/dev/null", "-f", composeFile, "config", "--format", "json"],
        cwd: imageRoot,
        env: {
            PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
            CMS_REPOSITORY_IMAGE: "registry.example.test/bernouy/cms-repository:2026.07.26-1",
            CMS_REPOSITORY_MANAGEMENT_TOKEN_SECRET_FILE: "/run/operator-secrets/repository-token",
            CMS_REPOSITORY_MAINTENANCE_TOKEN_SECRET_FILE: "/run/operator-secrets/repository-maintenance-token",
            CMS_REPOSITORY_WORKER_TOKEN_SECRET_FILE: "/run/operator-secrets/repository-worker-token",
            CMS_REPOSITORY_WORKER_CAPABILITY_KEY_SECRET_FILE: "/run/operator-secrets/repository-worker-capability-key",
            CMS_INTEGRATION_VERIFIER_WORKER_TOKEN_SECRET_FILE: "/run/operator-secrets/verifier-worker-token",
            CMS_INTEGRATION_VERIFIER_IMAGE:
                "registry.example.test/bernouy/cms-integration-verifier@sha256:" + "d".repeat(64),
            CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST: "sha256:" + "d".repeat(64),
            CMS_INTEGRATION_VERIFIER_SANDBOX_SIGNING_KEY_SECRET_FILE: "/run/operator-secrets/verifier-private.pem",
            CMS_INTEGRATION_VERIFIER_SANDBOX_VERIFICATION_KEY_FILE: "/run/operator-secrets/verifier-public.pem",
            CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_SECRET_FILE: "/run/operator-secrets/verifier-postgres-password",
            CMS_INTEGRATION_VERIFIER_POSTGRES_SERVER_PASSWORD_SECRET_FILE:
                "/run/operator-secrets/verifier-postgres-server-password",
        },
        stdout: "pipe",
        stderr: "pipe",
    });
    if (rendered.exitCode !== 0) {
        throw new Error(rendered.stderr.toString());
    }
    const config = JSON.parse(rendered.stdout.toString()) as {
        services: Record<
            string,
            {
                environment?: Record<string, string>;
                ports?: unknown;
                read_only?: boolean;
                user?: string;
                restart?: string;
                network_mode?: string;
                cap_add?: string[];
                cap_drop?: string[];
                healthcheck?: { disable?: boolean };
                depends_on?: Record<string, { condition?: string }>;
                networks?: Record<string, unknown>;
                secrets?: Array<{ source?: string; target?: string; uid?: string; gid?: string; mode?: string }>;
                tmpfs?: string[];
                volumes?: Array<{ target?: string; bind?: { create_host_path?: boolean } }>;
            }
        >;
        networks: Record<string, { internal?: boolean }>;
    };
    expect(Object.keys(config.services).toSorted()).toEqual([
        "cms-integration-verifier",
        "cms-integration-verifier-postgres",
        "cms-integration-verifier-sandbox",
        "cms-repository",
        "cms-repository-secret-check",
    ]);
    expect(config.services["cms-repository-secret-check"]).toMatchObject({
        user: "0:0",
        restart: "no",
        read_only: true,
        network_mode: "none",
        cap_add: ["DAC_READ_SEARCH"],
        cap_drop: ["ALL"],
        healthcheck: { disable: true },
    });
    expect(config.services["cms-repository-secret-check"]?.ports).toBeUndefined();
    expect(config.services["cms-repository"]?.depends_on?.["cms-repository-secret-check"]).toMatchObject({
        condition: "service_completed_successfully",
    });
    expect(config.services["cms-repository"]).toMatchObject({ read_only: true });
    expect(config.services["cms-repository"]?.environment).toMatchObject({
        CMS_REPOSITORY_MANAGEMENT_TOKEN_FILE: "/run/secrets/cms-repository-management-token",
        CMS_REPOSITORY_MAINTENANCE_TOKEN_FILE: "/run/secrets/cms-repository-maintenance-token",
        CMS_REPOSITORY_WORKER_TOKEN_FILE: "/run/secrets/cms-repository-worker-token",
        CMS_REPOSITORY_WORKER_CAPABILITY_KEY_FILE: "/run/secrets/cms-repository-worker-capability-key",
        CMS_REPOSITORY_WORKER_RATE_LIMIT: "120",
        CMS_REPOSITORY_WORKER_RATE_LIMIT_WINDOW_SECONDS: "60",
        CMS_REPOSITORY_CANDIDATE_TTL_MS: "86400000",
        CMS_REPOSITORY_WORKER_LEASE_DURATION_MS: "300000",
        CMS_REPOSITORY_CANDIDATE_GC_INTERVAL_MS: "21600000",
        CMS_REPOSITORY_CANDIDATE_OBJECT_GRACE_MS: "86400000",
        CMS_REPOSITORY_CANDIDATE_TERMINAL_RETENTION_MS: "604800000",
        CMS_REPOSITORY_CANDIDATE_PRUNE_AUDIT_RETENTION_MS: "2592000000",
    });
    expect(config.services["cms-repository"]?.secrets).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                source: "cms_repository_management_token",
                target: "cms-repository-management-token",
            }),
            expect.objectContaining({
                source: "cms_repository_maintenance_token",
                target: "cms-repository-maintenance-token",
            }),
            expect.objectContaining({
                source: "cms_repository_worker_token",
                target: "cms-repository-worker-token",
            }),
            expect.objectContaining({
                source: "cms_repository_worker_capability_key",
                target: "cms-repository-worker-capability-key",
            }),
        ]),
    );
    for (const secret of config.services["cms-repository"]?.secrets ?? []) {
        expect(secret).not.toHaveProperty("uid");
        expect(secret).not.toHaveProperty("gid");
        expect(secret).not.toHaveProperty("mode");
    }
    expect(config.services["cms-repository"]?.ports).toBeUndefined();
    expect(config.services["cms-repository"]?.tmpfs).toContain(
        "/tmp:rw,nosuid,nodev,noexec,size=64m,mode=1770,uid=1000,gid=1000",
    );
    expect(config.services["cms-repository"]?.volumes).toContainEqual(
        expect.objectContaining({
            target: "/var/lib/cms-repository/registry",
            bind: { create_host_path: false },
        }),
    );
    expect(config.networks.cms_repository).toMatchObject({ internal: true });
});

composeTest("management CMS override renders one private client and no repository ingress", () => {
    const cmsCompose = resolve(imageRoot, "../cms/compose.yml");
    const rendered = Bun.spawnSync({
        cmd: [
            "docker",
            "compose",
            "--env-file",
            "/dev/null",
            "-f",
            cmsCompose,
            "-f",
            resolve(imageRoot, "management-cms.override.yml"),
            "config",
            "--format",
            "json",
        ],
        cwd: imageRoot,
        env: {
            PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
            DOMAIN: "integrations.example.test",
            CMS_IMAGE: "registry.example.test/bernouy/cms:2026.07.26-1",
            MONGO_URL: "mongodb://cms:test@mongo:27017/integrations?authSource=admin",
            CMS_SESSION_SECRET: "a".repeat(64),
            CMS_KEK_HEX: "b".repeat(64),
            CMS_ADMIN_PASSWORD: "acceptance-password",
            ANALYTICS_SALT_SECRET: "c".repeat(64),
            P9R_INTEGRATION_REPOSITORY_URL: "http://cms-repository:3001/.cms/repository",
            P9R_INTEGRATION_REPOSITORY_ADMIN_SUBJECT_IDENTIFIER: "opaque-admin-subject",
            CMS_REPOSITORY_MANAGEMENT_TOKEN_SECRET_FILE: "/run/operator-secrets/repository-token",
        },
        stdout: "pipe",
        stderr: "pipe",
    });
    if (rendered.exitCode !== 0) {
        throw new Error(rendered.stderr.toString());
    }
    const config = JSON.parse(rendered.stdout.toString()) as {
        services: Record<
            string,
            {
                environment?: Record<string, string>;
                networks?: Record<string, unknown>;
                ports?: unknown;
                secrets?: Array<{ source?: string; target?: string }>;
            }
        >;
    };
    const cms = config.services.cms;
    expect(cms?.ports).toBeUndefined();
    expect(cms?.networks).toHaveProperty("cms_repository");
    expect(cms?.environment).toMatchObject({
        P9R_INTEGRATION_REPOSITORY_URL: "http://cms-repository:3001/.cms/repository",
        P9R_INTEGRATION_REPOSITORY_MANAGEMENT_URL: "http://cms-repository:3000/.cms/repository-management",
        P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TOKEN_FILE: "/run/secrets/cms-repository-management-token",
        P9R_INTEGRATION_REPOSITORY_ADMIN_SUBJECT_IDENTIFIER: "opaque-admin-subject",
    });
    expect(cms?.secrets).toContainEqual(
        expect.objectContaining({
            source: "cms_repository_management_token",
            target: "cms-repository-management-token",
        }),
    );
});
