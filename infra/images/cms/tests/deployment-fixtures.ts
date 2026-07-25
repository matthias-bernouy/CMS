import { test } from "bun:test";
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
    volumes?: Array<{ type: string; source: string; target: string }>;
    ports?: unknown[];
};

export type ComposeConfig = {
    services: Record<string, ComposeService>;
    networks?: Record<string, { name?: string; external?: boolean; internal?: boolean }>;
};

export const cmsDirectory = resolve(import.meta.dir, "..");
export const instanceComposeFile = resolve(cmsDirectory, "compose.yml");
export const infrastructureComposeFile = resolve(cmsDirectory, "infra/compose.yml");

export const instanceComposeSource = readFileSync(instanceComposeFile, "utf8");
export const infrastructureComposeSource = readFileSync(infrastructureComposeFile, "utf8");
export const instanceEnvExampleSource = readFileSync(resolve(cmsDirectory, ".env.example"), "utf8");
export const dockerfileSource = readFileSync(resolve(cmsDirectory, "Dockerfile"), "utf8");
export const mongoBootstrapSource = readFileSync(
    resolve(cmsDirectory, "infra/mongo/01-bootstrap-shared-users.js"),
    "utf8",
);
export const mongoPreflightSource = readFileSync(resolve(cmsDirectory, "infra/mongo/validate-env.sh"), "utf8");

const dockerEnvironment = minimalDockerEnvironment();
const dockerComposeAvailable = commandSucceeds(["docker", "compose", "version"], dockerEnvironment);
export const composeTest = dockerComposeAvailable ? test : test.skip;

export const requiredCmsEnvironment = {
    CMS_IMAGE: "registry.example.test/bernouy/cms:2026.07.15",
    CMS_SESSION_SECRET: "c".repeat(64),
    CMS_KEK_HEX: "d".repeat(64),
    CMS_ADMIN_PASSWORD: "deployment-test-password",
    ANALYTICS_SALT_SECRET: "e".repeat(64),
};

export function renderCompose(composeFile: string, environment: Record<string, string>): ComposeConfig {
    const result = Bun.spawnSync({
        cmd: ["docker", "compose", "--env-file", "/dev/null", "-f", composeFile, "config", "--format", "json"],
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

export function externalDockerfileBaseImages(): string[] {
    const stageAliases = new Set(extractMatches(dockerfileSource, /^FROM\s+\S+\s+AS\s+(\S+)/gim));
    return extractMatches(dockerfileSource, /^FROM\s+(\S+)/gim).filter((image) => !stageAliases.has(image));
}

export function extractMatches(source: string, expression: RegExp): string[] {
    return Array.from(source.matchAll(expression), (match) => match[1]);
}

function minimalDockerEnvironment(): Record<string, string> {
    const environment: Record<string, string> = {
        PATH: process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin",
        HOME: process.env.HOME ?? "/tmp",
    };

    for (const key of ["DOCKER_HOST", "DOCKER_CONTEXT", "XDG_RUNTIME_DIR"] as const) {
        const value = process.env[key];
        if (value) {
            environment[key] = value;
        }
    }

    return environment;
}

function commandSucceeds(command: string[], environment: Record<string, string>): boolean {
    try {
        return (
            Bun.spawnSync({
                cmd: command,
                env: environment,
                stdout: "ignore",
                stderr: "ignore",
            }).exitCode === 0
        );
    } catch {
        return false;
    }
}
