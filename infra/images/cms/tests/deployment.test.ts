import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type ComposeNetworkAttachment = { aliases?: string[]; gw_priority?: number } | null;

type ComposeService = {
    image?: string;
    entrypoint?: string[];
    environment?: Record<string, string>;
    networks?: Record<string, ComposeNetworkAttachment>;
    init?: boolean;
    read_only?: boolean;
    cap_drop?: string[];
    security_opt?: string[];
    tmpfs?: string[];
    ports?: unknown[];
};

type ComposeConfig = {
    services: Record<string, ComposeService>;
    networks?: Record<string, { name?: string; external?: boolean; internal?: boolean }>;
};

const cmsDirectory = resolve(import.meta.dir, "..");
const instanceComposeFile = resolve(cmsDirectory, "compose.yml");
const infrastructureComposeFile = resolve(cmsDirectory, "infra/compose.yml");

const instanceComposeSource = readFileSync(instanceComposeFile, "utf8");
const infrastructureComposeSource = readFileSync(infrastructureComposeFile, "utf8");
const dockerfileSource = readFileSync(resolve(cmsDirectory, "Dockerfile"), "utf8");
const mongoBootstrapSource = readFileSync(
    resolve(cmsDirectory, "infra/mongo/01-bootstrap-shared-users.js"),
    "utf8",
);
const mongoPreflightSource = readFileSync(resolve(cmsDirectory, "infra/mongo/validate-env.sh"), "utf8");

const dockerEnvironment = minimalDockerEnvironment();
const dockerComposeAvailable = commandSucceeds(["docker", "compose", "version"], dockerEnvironment);
const composeTest = dockerComposeAvailable ? test : test.skip;

const requiredCmsEnvironment = {
    CMS_IMAGE: "registry.example.test/bernouy/cms:2026.07.15",
    CMS_SESSION_SECRET: "c".repeat(64),
    CMS_KEK_HEX: "d".repeat(64),
    CMS_ADMIN_PASSWORD: "deployment-test-password",
};

describe("per-instance Compose rendering", () => {
    composeTest("uses the shared MongoDB account with an instance-specific database", () => {
        const appPassword = "b".repeat(64);
        const mongoUrl = `mongodb://cms_app:${appPassword}@mongo:27017/cms_client?authSource=admin`;
        const config = renderCompose(instanceComposeFile, {
            ...requiredCmsEnvironment,
            DOMAIN: "client.example.test",
            MONGO_URL: mongoUrl,
        });

        expect(Object.keys(config.services)).toEqual(["cms"]);

        const cms = config.services.cms;
        expect(cms.environment?.MONGO_URL).toBe(mongoUrl);
        expect(Object.keys(cms.networks ?? {}).sort()).toEqual(["cms_mongo", "cms_proxy"]);
        expect(cms.networks?.cms_proxy).toMatchObject({ gw_priority: 1 });
        expect(config.networks?.cms_mongo).toMatchObject({ name: "cms_mongo", external: true });
        expect(config.networks?.cms_proxy).toMatchObject({ name: "cms_proxy", external: true });

        expect(cms.init).toBe(true);
        expect(cms.read_only).toBe(true);
        expect(cms.cap_drop).toEqual(["ALL"]);
        expect(cms.security_opt).toContain("no-new-privileges:true");
        expect(cms.tmpfs).toContain("/tmp:rw,nosuid,nodev,noexec,size=256m");
        expect(cms.ports).toBeUndefined();
    });

    composeTest("preserves an external cluster URL without requiring INSTANCE_ID", () => {
        const mongoUrl =
            "mongodb+srv://cms_user:password@cluster.example.test/cms-client?retryWrites=true&w=majority";
        const config = renderCompose(instanceComposeFile, {
            ...requiredCmsEnvironment,
            DOMAIN: "external.example.test",
            MONGO_URL: mongoUrl,
        });

        expect(Object.keys(config.services)).toEqual(["cms"]);
        expect(config.services.cms.environment?.MONGO_URL).toBe(mongoUrl);
    });
});

describe("shared infrastructure Compose rendering", () => {
    composeTest("contains pinned proxy and authenticated MongoDB services", () => {
        const rootPassword = "a".repeat(64);
        const appPassword = "b".repeat(64);
        const config = renderCompose(infrastructureComposeFile, {
            LETSENCRYPT_EMAIL: "ops@example.test",
            MONGO_ROOT_USERNAME: "cms_root",
            MONGO_ROOT_PASSWORD: rootPassword,
            MONGO_APP_USERNAME: "cms_app",
            MONGO_APP_PASSWORD: appPassword,
        });

        expect(Object.keys(config.services).sort()).toEqual(["acme-companion", "mongo", "nginx-proxy"]);

        const pinnedImage = /:\d+(?:\.\d+){1,2}(?:-[a-z0-9.-]+)?@sha256:[a-f0-9]{64}$/i;
        for (const serviceName of ["nginx-proxy", "acme-companion", "mongo"]) {
            expect(config.services[serviceName].image).toMatch(pinnedImage);
        }

        const mongo = config.services.mongo;
        expect(mongo.entrypoint).toEqual(["/bin/sh", "/opt/cms-mongo/validate-env.sh"]);
        expect(mongo.ports).toBeUndefined();
        expect(Object.keys(mongo.networks ?? {})).toEqual(["cms_mongo"]);
        expect(mongo.networks?.cms_mongo).toMatchObject({ aliases: ["mongo"] });
        expect(config.networks?.cms_mongo).toMatchObject({ name: "cms_mongo", internal: true });
        expect(mongo.environment).toMatchObject({
            MONGO_INITDB_ROOT_USERNAME: "cms_root",
            MONGO_INITDB_ROOT_PASSWORD: rootPassword,
            MONGO_APP_USERNAME: "cms_app",
            MONGO_APP_PASSWORD: appPassword,
        });
    });
});

describe("deployment definition safeguards", () => {
    test("creates exactly the shared root and readWriteAnyDatabase roles", () => {
        const roleBindings = Array.from(
            mongoBootstrapSource.matchAll(
                /roles:\s*\[\{\s*role:\s*["']([^"']+)["'],\s*db:\s*["']([^"']+)["']\s*\}\]/g,
            ),
            (match) => ({ role: match[1], database: match[2] }),
        );

        expect(roleBindings).toEqual([
            { role: "root", database: "admin" },
            { role: "readWriteAnyDatabase", database: "admin" },
        ]);
        expect(mongoBootstrapSource).not.toMatch(/role:\s*["']readWrite["']/);
        expect(mongoBootstrapSource).not.toContain("MONGO_APP_DATABASE");
        expect(mongoBootstrapSource).toContain(
            'assertOnlyRole(existingApp, appUsername, "readWriteAnyDatabase")',
        );
    });

    test("requires 64-character hexadecimal root and application passwords", () => {
        expect(mongoBootstrapSource).toContain(
            'const rootPassword = requiredHexSecret("MONGO_INITDB_ROOT_PASSWORD")',
        );
        expect(mongoBootstrapSource).toContain(
            'const appPassword = requiredHexSecret("MONGO_APP_PASSWORD")',
        );
        expect(mongoBootstrapSource).toContain("/^[a-fA-F0-9]{64}$/");
        expect(mongoPreflightSource).toContain('validate_hex_secret MONGO_INITDB_ROOT_PASSWORD');
        expect(mongoPreflightSource).toContain('validate_hex_secret MONGO_APP_PASSWORD');
        expect(mongoPreflightSource).toContain('exec /usr/local/bin/docker-entrypoint.sh "$@"');
    });

    test("does not use a latest image tag", () => {
        const imageReferences = [
            ...extractMatches(instanceComposeSource, /^\s*image:\s+([^\s#]+)/gim),
            ...extractMatches(infrastructureComposeSource, /^\s*image:\s+([^\s#]+)/gim),
            ...externalDockerfileBaseImages(),
        ];

        expect(imageReferences.length).toBeGreaterThan(0);
        for (const imageReference of imageReferences) {
            expect(imageReference).not.toMatch(/:latest(?:@sha256:[a-f0-9]{64})?$/i);
        }
    });

    test("pins every external Dockerfile base image by version and digest", () => {
        const baseImages = externalDockerfileBaseImages();

        expect(baseImages.length).toBeGreaterThan(0);
        for (const baseImage of baseImages) {
            expect(baseImage).toMatch(/:\d+(?:\.\d+)+-[a-z0-9.-]+@sha256:[a-f0-9]{64}$/i);
        }
    });
});

function renderCompose(composeFile: string, environment: Record<string, string>): ComposeConfig {
    const result = Bun.spawnSync({
        cmd: [
            "docker",
            "compose",
            "--env-file",
            "/dev/null",
            "-f",
            composeFile,
            "config",
            "--format",
            "json",
        ],
        cwd: cmsDirectory,
        env: { ...dockerEnvironment, ...environment },
        stdout: "pipe",
        stderr: "pipe",
    });

    if (result.exitCode !== 0) {
        throw new Error(`docker compose config failed:\n${result.stderr.toString()}`);
    }

    return JSON.parse(result.stdout.toString()) as ComposeConfig;
}

function minimalDockerEnvironment(): Record<string, string> {
    const environment: Record<string, string> = {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: process.env.HOME ?? "/tmp",
    };

    for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "XDG_RUNTIME_DIR"] as const) {
        const value = process.env[key];
        if (value) environment[key] = value;
    }

    return environment;
}

function commandSucceeds(command: string[], environment: Record<string, string>): boolean {
    try {
        return Bun.spawnSync({
            cmd: command,
            env: environment,
            stdout: "ignore",
            stderr: "ignore",
        }).exitCode === 0;
    } catch {
        return false;
    }
}

function externalDockerfileBaseImages(): string[] {
    const stageAliases = new Set(extractMatches(dockerfileSource, /^FROM\s+\S+\s+AS\s+(\S+)/gim));
    return extractMatches(dockerfileSource, /^FROM\s+(\S+)/gim).filter((image) => !stageAliases.has(image));
}

function extractMatches(source: string, expression: RegExp): string[] {
    return Array.from(source.matchAll(expression), (match) => match[1]);
}
