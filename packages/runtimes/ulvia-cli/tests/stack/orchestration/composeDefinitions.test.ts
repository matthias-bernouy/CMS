import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../../src/runtime/paths";
import { defaultInstallationConfig, parseInstallationConfig } from "../../../src/runtime/stack/installation";
import { localServicesEnvironment } from "../../../src/runtime/stack/orchestration/environment";
import { localServicesIdentity } from "../../../src/runtime/stack/orchestration/state";
import { writeSharedComposeFiles } from "../../../src/runtime/stack/orchestration/shared/files";
import type { InstallationConfig } from "../../../src/runtime/stack/installation";

const definitions = resolve(import.meta.dir, "../../../src/runtime/stack/orchestration/definitions");
const dockerAvailable =
    Bun.spawnSync(["docker", "compose", "version"], { stdout: "ignore", stderr: "ignore" }).exitCode === 0;
const composeTest = dockerAvailable ? test : test.skip;

composeTest("shared Compose renders persistent Caddy and loopback Provider without per-site services", async () => {
    await withRendered(
        defaultInstallationConfig({ ULVIA_HTTP_PORT: "15100", ULVIA_PROVIDER_PORT: "15103" }),
        (model, caddy) => {
            expect(Object.keys(model.services).sort()).toEqual([
                "edge-1",
                "mongo",
                "mongo-provision",
                "provider",
                "proxy",
            ]);
            const { provider, proxy, mongo } = model.services;
            expect(proxy!.ports).toEqual([
                { mode: "ingress", host_ip: "127.0.0.1", target: 80, published: "15100", protocol: "tcp" },
            ]);
            expect(proxy!.image).toMatch(/^caddy:2\.11\.9-alpine@sha256:/u);
            expect(proxy!.volumes).toContainEqual(expect.objectContaining({ type: "bind", target: "/data" }));
            expect(proxy!.volumes?.some(({ target }) => String(target).includes("docker.sock"))).toBe(false);
            expect(provider!.ports?.[0]).toMatchObject({ host_ip: "127.0.0.1", target: 5103, published: "15103" });
            expect(provider!.environment).toMatchObject({
                MODE: "PROD",
                ULVIA_CONTROL_ORIGIN: "http://control.localhost:15100",
                ULVIA_CONTROL_BOOTSTRAP_FILE: "/run/ulvia/control-administrator.json",
            });
            expect(provider!.environment.MONGO_URL).toContain("ulvia_provider:");
            expect(provider!.healthcheck?.test.join(" ")).toContain("/readyz");
            expect(provider!.environment.CMS_REPOSITORY_URL).toBeUndefined();
            expect(provider!.environment.CMS_REPOSITORY_ALLOW_INSECURE_HTTP).toBeUndefined();
            expect(mongo!.ports).toBeUndefined();
            expect(mongo!.ulimits).toEqual({ nofile: { soft: 65536, hard: 65536 } });
            expect(caddy.admin).toEqual({ disabled: true });
            expect(JSON.stringify(caddy)).toContain(":8080");
            expect(provider!.environment.ULVIA_HOSTING_PROXY_URL).toBe("http://proxy:8080");
            expect(proxy!.ports?.some((port) => port.target === 8080)).toBe(false);
            expect(JSON.stringify(caddy)).toContain("edge-1:3000");
            expect(JSON.stringify(caddy)).not.toContain("nginx");
        },
    );
});

composeTest("configured shared Edges receive no persistence or operator credentials", async () => {
    const initial = defaultInstallationConfig();
    const installation = parseInstallationConfig({ ...initial, hosting: { ...initial.hosting, edgeCount: 2 } });
    await withRendered(installation, (model, caddy) => {
        expect(Object.keys(model.services).filter((name) => name.startsWith("edge-"))).toEqual(["edge-1", "edge-2"]);
        for (const name of ["edge-1", "edge-2"]) {
            const edge = model.services[name]!;
            expect(Object.keys(edge.environment).sort()).toEqual([
                "CMS_HOST",
                "CMS_HOSTING_EDGE_SECRET",
                "CMS_HOSTING_PROVIDER_URL",
                "CMS_PORT",
                "MODE",
                "NODE_ENV",
            ]);
            expect(edge.environment.CMS_HOSTING_PROVIDER_URL).toBe("http://ulvia-provider:5103");
            expect(edge.read_only).toBe(true);
            expect(edge.cap_drop).toEqual(["ALL"]);
            expect(edge.volumes).toBeUndefined();
            expect(edge.depends_on?.provider).toMatchObject({ condition: "service_healthy" });
        }
        expect(model.services.proxy!.depends_on).toMatchObject({
            "edge-1": { condition: "service_healthy" },
            "edge-2": { condition: "service_healthy" },
        });
        expect(JSON.stringify(caddy)).toContain("edge-2:3000");
    });
});

composeTest("ACME uses the same Caddy service and an admitted anonymous permission contract", async () => {
    const initial = defaultInstallationConfig();
    const installation = parseInstallationConfig({
        ...initial,
        bindAddress: "0.0.0.0",
        tls: { mode: "acme", email: "ops@example.com", httpsPort: 15443 },
        hosting: {
            ...initial.hosting,
            controlOrigin: "https://control.example.com:15443",
            publicAddresses: ["203.0.113.10"],
        },
    });
    await withRendered(installation, (model, caddy) => {
        expect(model.services.acme).toBeUndefined();
        expect(model.services.proxy!.ports?.[1]).toMatchObject({ host_ip: "0.0.0.0", target: 443, published: "15443" });
        expect(model.services.provider!.environment.ULVIA_TLS_ENTRYPOINTS).toBe('[{"host":"proxy","port":443}]');
        expect(model.services.provider!.environment.ULVIA_TLS_PUBLIC_ADDRESSES).toBe('["203.0.113.10"]');
        expect(JSON.stringify(caddy)).toContain("/hosting/tls/permission");
        expect(JSON.stringify(caddy)).toContain("https://acme-v02.api.letsencrypt.org/directory");
        expect(JSON.stringify(caddy)).not.toContain("operator");
    });
});

type RenderedService = {
    image: string;
    environment: Record<string, string>;
    ports?: Array<Record<string, unknown>>;
    read_only?: boolean;
    cap_drop?: string[];
    volumes?: Array<Record<string, unknown>>;
    depends_on?: Record<string, unknown>;
    healthcheck?: { test: string[] };
    ulimits?: unknown;
};
type RenderedCompose = { services: Record<string, RenderedService> };
async function withRendered(
    installation: InstallationConfig,
    assert: (model: RenderedCompose, caddy: Record<string, unknown>) => void,
) {
    const root = await mkdtemp(join(tmpdir(), "ulvia-compose-shared-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    await ensureUlviaPaths(paths);
    try {
        await writeSharedComposeFiles(paths, installation);
        const digest = `sha256:${"a".repeat(64)}`;
        const state = {
            ...localServicesIdentity(paths),
            images: {
                provider: { component: "provider" as const, version: "1.0.0", digest },
                edge: { component: "edge" as const, version: "1.0.0", digest },
            },
        };
        const files = [
            resolve(definitions, "services.yml"),
            ...(installation.tls.mode === "acme" ? [resolve(definitions, "services-tls.yml")] : []),
            join(paths.services, "shared-edges.json"),
        ];
        const result = Bun.spawnSync({
            cmd: [
                "docker",
                "compose",
                "--env-file",
                "/dev/null",
                ...files.flatMap((path) => ["--file", path]),
                "config",
                "--format",
                "json",
            ],
            cwd: definitions,
            env: {
                PATH: process.env.PATH,
                ...localServicesEnvironment(paths, installation, state),
                CMS_REPOSITORY_URL: "http://unselected.invalid",
            },
            stdout: "pipe",
            stderr: "pipe",
        });
        if (result.exitCode !== 0) {
            throw new Error(result.stderr.toString());
        }
        assert(
            JSON.parse(result.stdout.toString()),
            JSON.parse(await readFile(join(paths.services, "proxy/caddy.json"), "utf8")),
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}
