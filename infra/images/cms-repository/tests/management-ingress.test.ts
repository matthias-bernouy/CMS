import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    REPOSITORY_CANDIDATES_PATH,
    REPOSITORY_CANDIDATE_REPORT_PATH,
    REPOSITORY_CANDIDATE_STATUS_PATH,
    REPOSITORY_COMPATIBILITY_PATH,
    REPOSITORY_COMPATIBILITY_REEVALUATIONS_PATH,
    REPOSITORY_DIAGNOSTICS_PATH,
    REPOSITORY_MANAGEMENT_BASE_PATH,
    REPOSITORY_RELEASE_PATH,
    REPOSITORY_SCHEMA_BASELINE_IMPORT_PATH,
    REPOSITORY_STABLE_PROMOTIONS_PATH,
    REPOSITORY_STATUS_PATH,
    REPOSITORY_VERIFICATION_BACKFILL_PATH,
    REPOSITORY_VERIFICATION_JOBS_PATH,
    REPOSITORY_VERSION_BLOCKS_PATH,
    REPOSITORY_VERSIONS_PATH,
} from "@bernouy/cms-repository-management";

const root = resolve(import.meta.dir, "..");
const composeFile = resolve(root, "compose.yml");
const overrideFile = resolve(root, "management-ingress.override.yml");
const ingressConfig = readFileSync(resolve(root, "management-ingress.nginx.conf"), "utf8");
const overrideSource = readFileSync(overrideFile, "utf8");
const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
const readme = readFileSync(resolve(root, "README.md"), "utf8");

const allowedRoutes = [
    ["GET", REPOSITORY_STATUS_PATH],
    ["GET", REPOSITORY_DIAGNOSTICS_PATH],
    ["GET", REPOSITORY_VERSIONS_PATH],
    ["GET", REPOSITORY_COMPATIBILITY_PATH],
    ["GET", REPOSITORY_RELEASE_PATH],
    ["GET", REPOSITORY_CANDIDATE_STATUS_PATH],
    ["GET", REPOSITORY_CANDIDATE_REPORT_PATH],
    ["POST", REPOSITORY_CANDIDATES_PATH],
    ["POST", REPOSITORY_STABLE_PROMOTIONS_PATH],
    ["POST", REPOSITORY_VERSION_BLOCKS_PATH],
    ["POST", REPOSITORY_COMPATIBILITY_REEVALUATIONS_PATH],
] as const;

describe("remote repository management ingress", () => {
    test("uses an exact method-and-path allow-list for ordinary management only", () => {
        for (const [method, path] of allowedRoutes) {
            expect(ingressConfig).toContain(`"${method}:${REPOSITORY_MANAGEMENT_BASE_PATH}${path}" 1;`);
        }
        expect(ingressConfig).not.toContain(
            `${REPOSITORY_MANAGEMENT_BASE_PATH}${REPOSITORY_SCHEMA_BASELINE_IMPORT_PATH}`,
        );
        expect(ingressConfig).not.toContain(
            `${REPOSITORY_MANAGEMENT_BASE_PATH}${REPOSITORY_VERIFICATION_BACKFILL_PATH}`,
        );
        expect(ingressConfig).not.toContain(`${REPOSITORY_MANAGEMENT_BASE_PATH}${REPOSITORY_VERIFICATION_JOBS_PATH}`);
        expect(ingressConfig).toContain("if ($repository_management_route = 0)");
        expect(ingressConfig).toContain("return 404;");
    });

    test("streams bounded authenticated requests without logging credentials", () => {
        expect(ingressConfig).toContain("client_max_body_size 64m;");
        expect(ingressConfig).toContain("proxy_request_buffering off;");
        expect(ingressConfig).toContain("proxy_buffering off;");
        expect(ingressConfig).toContain("proxy_set_header Authorization $http_authorization;");
        expect(ingressConfig).toContain("access_log off;");
        expect(ingressConfig).not.toMatch(/\$http_authorization.*(?:log|return)/u);
        expect(ingressConfig).toContain("server cms-repository:3000 resolve;");
    });

    test("pins and hardens a secret-free TLS proxy service", () => {
        expect(overrideSource).toMatch(/image: nginx:1\.31\.1-alpine@sha256:[a-f0-9]{64}/u);
        expect(overrideSource).toContain("CMS_REPOSITORY_MANAGEMENT_DOMAIN");
        expect(overrideSource).toContain("ACME_HOST:");
        expect(overrideSource).toContain("HTTPS_METHOD: redirect");
        expect(overrideSource).toContain("read_only: true");
        expect(overrideSource).toContain("no-new-privileges:true");
        expect(overrideSource).toMatch(/cap_drop:\n\s+- ALL/u);
        expect(overrideSource).not.toMatch(/^\s+ports:/mu);
        expect(overrideSource).not.toContain("secrets:");
        expect(overrideSource).not.toMatch(/(?:MANAGEMENT|MAINTENANCE|WORKER)_TOKEN/u);
    });

    test("documents explicit remote enablement and an HTTPS-only CLI URL", () => {
        expect(envExample).toContain("# CMS_REPOSITORY_MANAGEMENT_DOMAIN=management.repository.example.com");
        expect(envExample).toContain("# CMS_PROXY_NETWORK_NAME=cms_proxy");
        expect(readme).toContain("management-ingress.override.yml");
        expect(readme).toContain(
            "P9R_INTEGRATION_REPOSITORY_MANAGEMENT_URL=https://management.repository.example.com/.cms/repository-management",
        );
        expect(readme).toContain("Never add a raw `3000:3000` host mapping");
        expect(readme).toContain("Maintenance baseline/backfill endpoints, verifier worker endpoints");
    });
});

const dockerComposeAvailable =
    Bun.spawnSync({ cmd: ["docker", "compose", "version"], stdout: "ignore", stderr: "ignore" }).exitCode === 0;
const composeTest = dockerComposeAvailable ? test : test.skip;

composeTest("renders one narrow proxy while retaining repository network isolation", () => {
    const rendered = Bun.spawnSync({
        cmd: [
            "docker",
            "compose",
            "--env-file",
            "/dev/null",
            "-f",
            composeFile,
            "-f",
            overrideFile,
            "config",
            "--format",
            "json",
        ],
        cwd: root,
        env: renderEnvironment(),
        stdout: "pipe",
        stderr: "pipe",
    });
    expect(rendered.exitCode, rendered.stderr.toString()).toBe(0);
    const config = JSON.parse(rendered.stdout.toString()) as {
        services: Record<string, Record<string, unknown>>;
        networks: Record<string, { external?: boolean; internal?: boolean; name?: string }>;
    };
    const repository = config.services["cms-repository"]!;
    const ingress = config.services["cms-repository-management-ingress"]!;

    expect(repository).not.toHaveProperty("ports");
    expect(Object.keys(repository.networks as object)).toEqual(["cms_repository"]);
    expect(ingress).toMatchObject({
        image: `nginx:1.31.1-alpine@sha256:${"8b1e78743a03dbb2c95171cc58639fef29abc8816598e27fb910ed2e621e589a"}`,
        user: "101:101",
        read_only: true,
        cap_drop: ["ALL"],
        pids_limit: 32,
    });
    expect(ingress).not.toHaveProperty("ports");
    expect(ingress).not.toHaveProperty("secrets");
    expect(Object.keys(ingress.networks as object).toSorted()).toEqual(["cms_proxy", "cms_repository"]);
    expect(ingress.environment).toMatchObject({
        VIRTUAL_HOST: "management.repository.example.test",
        VIRTUAL_PORT: "8080",
        ACME_HOST: "management.repository.example.test",
        HTTPS_METHOD: "redirect",
    });
    expect(config.networks.cms_repository).toMatchObject({ internal: true });
    expect(config.networks.cms_proxy).toMatchObject({ external: true, name: "cms_proxy" });
});

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
        CMS_INTEGRATION_VERIFIER_POSTGRES_PASSWORD_SECRET_FILE: "/secrets/postgres",
        CMS_INTEGRATION_VERIFIER_POSTGRES_SERVER_PASSWORD_SECRET_FILE: "/secrets/postgres-server",
        CMS_REPOSITORY_MANAGEMENT_DOMAIN: "management.repository.example.test",
    };
}
