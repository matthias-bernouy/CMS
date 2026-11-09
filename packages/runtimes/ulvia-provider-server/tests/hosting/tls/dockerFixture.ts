import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createCaddyHostingConfiguration } from "@bernouy/hosting/caddy";
import pebbleConfiguration from "./pebble.json";

const CADDY = "caddy:2.11.9-alpine@sha256:0bbb055bda6793c999bde78b1b5ce3e89f829fb031af2cf50056ea1246559fee";
const PEBBLE = "ghcr.io/letsencrypt/pebble@sha256:ddf230642b1a584f519f32e347de1b05a6e4c1f6c35c1863b33effeab5f78199";

export async function docker(
    args: string[],
    timeoutMs = 30_000,
    allowFailure = false,
    includeError = false,
): Promise<string> {
    const child = Bun.spawn(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    try {
        const [code, output, error] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ]);
        if (code && !allowFailure) {
            throw new Error(`Docker ${args[0]} failed (${code}): ${error.slice(-8000)}\n${output.slice(-8000)}`);
        }
        return includeError ? output + error : output;
    } finally {
        clearTimeout(timer);
    }
}

/** No host ports, Docker socket, production CA, public DNS or persistent test credentials. */
export async function createAcmeFixture(image: string) {
    const id = `ulvia-acme-${randomUUID().slice(0, 8)}`;
    const root = await mkdtemp(join(tmpdir(), `${id}-`));
    const workspace = resolve(import.meta.dir, "../../../../../..");
    const names = new Set<string>();
    let network = false;
    let volume = false;
    const close = async () => {
        if (names.size) {
            await docker(["rm", "--force", "--volumes", ...names], 30_000, true);
        }
        if (volume) {
            await docker(["volume", "rm", `${id}-certificates`], 30_000, true);
        }
        if (network) {
            await docker(["network", "rm", id], 30_000, true);
        }
        await rm(root, { recursive: true, force: true });
    };
    const run = async (name: string, options: string[], selectedImage: string, args: string[] = []) => {
        names.add(name);
        return docker(["run", "--detach", "--name", name, "--network", id, ...options, selectedImage, ...args]);
    };
    try {
        await docker(["network", "create", "--internal", id]);
        network = true;
        await docker(["volume", "create", `${id}-certificates`]);
        volume = true;
        const exporter = `${id}-export`;
        names.add(exporter);
        await docker(["create", "--name", exporter, PEBBLE]);
        await docker(["cp", `${exporter}:/test/certs/pebble.minica.pem`, join(root, "pebble.minica.pem")]);
        await docker(["rm", exporter]);
        names.delete(exporter);
        await writeFile(join(root, "pebble.json"), JSON.stringify(pebbleConfiguration));
        await writeFile(
            join(root, "caddy.json"),
            JSON.stringify(
                createCaddyHostingConfiguration({
                    permissionUrl: "http://provider:5103/hosting/tls/permission",
                    upstreams: ["provider:5104"],
                    storageRoot: "/data/caddy",
                    tls: {
                        issuer: "acme",
                        directory: "https://pebble:14000/dir",
                        email: "operator@example.test",
                        trustedRoots: ["/trust/pebble.minica.pem"],
                    },
                }),
            ),
        );
        await run(
            `${id}-pebble`,
            ["--network-alias", "pebble", "--env", "PEBBLE_VA_NOSLEEP=1", "--volume", `${root}:/trust:ro`],
            PEBBLE,
            ["-config", "/trust/pebble.json"],
        );
        const startProxies = async () => {
            for (const node of ["a", "b"]) {
                await run(
                    `${id}-proxy-${node}`,
                    [
                        "--network-alias",
                        `proxy-${node}`,
                        ...(node === "a"
                            ? ["control", "site", "pending", "unknown"].flatMap((domain) => [
                                  "--network-alias",
                                  `${domain}.ulvia.test`,
                              ])
                            : []),
                        "--volume",
                        `${root}:/trust:ro`,
                        "--volume",
                        `${id}-certificates:/data`,
                    ],
                    CADDY,
                    ["caddy", "run", "--config", "/trust/caddy.json"],
                );
            }
        };
        await startProxies();
        const addresses = await Promise.all(
            ["a", "b"].map(async (node) => {
                const metadata = JSON.parse(await docker(["inspect", `${id}-proxy-${node}`]));
                return metadata[0].NetworkSettings.Networks[id].IPAddress as string;
            }),
        );
        const fixtureOptions = [
            "--no-healthcheck",
            "--volume",
            `${workspace}:/workspace:ro`,
            "--workdir",
            "/workspace",
            "--tmpfs",
            "/workspace/packages/features/content/dist/runtime-assets:rw,uid=1000,gid=1000,mode=0755",
            "--volume",
            `${root}:/trust`,
            "--entrypoint",
            "bun",
        ];
        const ready = `${id}-ready`;
        names.add(ready);
        await docker([
            "run",
            "--rm",
            "--name",
            ready,
            "--network",
            id,
            ...fixtureOptions,
            image,
            "-e",
            `
const ca = await Bun.file('/trust/pebble.minica.pem').text();
const deadline = Date.now() + 15000;
for (;;) {
    const response = await fetch('https://pebble:15000/roots/0', { tls: { ca }, signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (response?.ok) { await response.body?.cancel(); break; }
    await response?.body?.cancel();
    if (Date.now() >= deadline) { throw new Error('Pebble management API did not become ready'); }
    await Bun.sleep(100);
}`,
        ]);
        names.delete(ready);
        return {
            async phase(phase: "fresh" | "restart") {
                const name = `${id}-provider`;
                names.add(name);
                console.info(`[hosting-tls] ${phase}: two entrypoints, isolated ACME and shared certificate storage`);
                const output = await docker(
                    [
                        "run",
                        "--name",
                        name,
                        "--network",
                        id,
                        "--network-alias",
                        "provider",
                        ...fixtureOptions,
                        "--env",
                        "ULVIA_TEST_CADDY_ACME=1",
                        "--env",
                        `ULVIA_TEST_TLS_PHASE=${phase}`,
                        "--env",
                        `ULVIA_TEST_TLS_ADDRESSES=${JSON.stringify(addresses)}`,
                        image,
                        "test",
                        "packages/runtimes/ulvia-provider-server/tests/hosting/tls/acme.docker.test.ts",
                    ],
                    180_000,
                    false,
                    true,
                );
                console.info(output.trim());
                await docker(["rm", name]);
                names.delete(name);
            },
            async restart() {
                await docker(["rm", "--force", `${id}-proxy-a`, `${id}-proxy-b`]);
                await startProxies();
            },
            async diagnostics() {
                for (const name of names) {
                    console.info(`${name}\n${await docker(["logs", "--tail", "50", name], 30_000, true, true)}`);
                }
            },
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}
