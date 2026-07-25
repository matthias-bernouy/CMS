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
        expect(dockerfileSource).not.toMatch(/CMS_REPOSITORY_(?:MANAGEMENT_)?TOKEN=/);
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
        expect(composeSource).toContain("/tmp:rw,nosuid,nodev,noexec,size=64m,mode=1770");
        expect(composeSource).toContain("no-new-privileges:true");
        expect(composeSource).toMatch(/cap_drop:\n\s+- ALL/);
    });

    test("loads only the management credential from a Docker secret file", () => {
        expect(composeSource).toContain("CMS_REPOSITORY_MANAGEMENT_TOKEN_FILE: /run/secrets/");
        expect(composeSource).toContain("CMS_REPOSITORY_MANAGEMENT_TOKEN_SECRET_FILE");
        expect(composeSource).toContain("mode: 0400");
        expect(envExampleSource).not.toMatch(/^CMS_REPOSITORY_MANAGEMENT_TOKEN=/m);
        expect(`${composeSource}\n${envExampleSource}`).not.toMatch(/READ_TOKEN|REPOSITORY_TOKEN=/);
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
        expect(overrideSource).toContain("CMS_REPOSITORY_MANAGEMENT_TOKEN_SECRET_FILE");
        expect(overrideSource).toContain("P9R_INTEGRATION_REPOSITORY_URL: http://cms-repository:3001/.cms/repository");
        expect(overrideSource).toMatch(/cms_repository:\n\s+external: true/);
        expect(overrideSource).not.toContain("3000:");
    });
});

describe("registry lifecycle documentation", () => {
    test("documents empty-only bootstrap and image-upgrade immutability", () => {
        expect(readmeSource).toMatch(/only when the\s+registry root has no entries at all/);
        expect(readmeSource).toContain("image upgrades never reconcile or mutate registry contents");
        expect(readmeSource).toContain("Public reads have no token");
        expect(readmeSource).toContain("last valid snapshot stays available");
    });
});

const dockerComposeAvailable =
    Bun.spawnSync({ cmd: ["docker", "compose", "version"], stdout: "ignore", stderr: "ignore" }).exitCode === 0;
const composeTest = dockerComposeAvailable ? test : test.skip;

composeTest("Compose renders with one isolated service and no published ports", () => {
    const rendered = Bun.spawnSync({
        cmd: ["docker", "compose", "--env-file", "/dev/null", "-f", composeFile, "config", "--format", "json"],
        cwd: imageRoot,
        env: {
            PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
            CMS_REPOSITORY_IMAGE: "registry.example.test/bernouy/cms-repository:2026.07.26-1",
            CMS_REPOSITORY_MANAGEMENT_TOKEN_SECRET_FILE: "/run/operator-secrets/repository-token",
        },
        stdout: "pipe",
        stderr: "pipe",
    });
    if (rendered.exitCode !== 0) {
        throw new Error(rendered.stderr.toString());
    }
    const config = JSON.parse(rendered.stdout.toString()) as {
        services: Record<string, { ports?: unknown; read_only?: boolean; networks?: Record<string, unknown> }>;
        networks: Record<string, { internal?: boolean }>;
    };
    expect(Object.keys(config.services)).toEqual(["cms-repository"]);
    expect(config.services["cms-repository"]).toMatchObject({ read_only: true });
    expect(config.services["cms-repository"]?.ports).toBeUndefined();
    expect(config.networks.cms_repository).toMatchObject({ internal: true });
});
