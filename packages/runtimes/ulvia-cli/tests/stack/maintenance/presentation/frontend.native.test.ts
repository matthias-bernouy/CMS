import { expect, test } from "bun:test";
import { request } from "node:https";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCommand } from "../../../../src/runtime/process";
import { maintenanceConfiguration } from "../../../../src/runtime/maintenance/presentation/configuration";
import { copyPresentationCertificates } from "../../../../src/runtime/maintenance/presentation/certificates";
import { frontendArguments } from "../../../../src/runtime/maintenance/presentation/frontend";
import { until } from "../upgrade/database";
const native = process.env.ULVIA_RUN_MAINTENANCE_FRONTEND === "1" ? test : test.skip;
native(
    "real Caddy serves isolated custom Pages and frozen assets over HTTP and HTTPS without any CMS service",
    async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-static-maintenance-"));
        const name = `ulvia-static-test-${crypto.randomUUID()}`;
        const reserved = [0, 1].map(() => Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() }));
        const [http, https] = reserved.map((server) => server.port!);
        for (const server of reserved) {
            server.stop(true);
        }
        try {
            const ids = ["a".repeat(64), "b".repeat(64)];
            const sites = ids.map((id, i) => ({
                id,
                hosts: i === 0 ? ["one.localhost", "alias.localhost"] : ["two.localhost"],
                resources: ["text/css", "image/png", "font/woff2"],
            }));
            for (const [i, site] of sites.entries()) {
                const dir = join(root, "sites", site.id);
                await mkdir(dir, { recursive: true });
                await writeFile(
                    join(dir, "page.html"),
                    `<html><p>Site ${i}</p><link rel="stylesheet" href="/_content/maintenance/${site.id}/0"></html>`,
                );
                await writeFile(join(dir, "0"), ".error{color:blue}");
                await writeFile(join(dir, "1"), "png");
                await writeFile(join(dir, "2"), "font");
            }
            await mkdir(join(root, "source"));
            await runCommand([
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-days",
                "1",
                "-subj",
                "/CN=one.localhost",
                "-addext",
                "subjectAltName=DNS:one.localhost,DNS:alias.localhost,DNS:two.localhost",
                "-keyout",
                join(root, "source/test.key"),
                "-out",
                join(root, "source/test.crt"),
            ]);
            const certs = await copyPresentationCertificates(join(root, "source"), join(root, "certificates"), [
                "one.localhost",
                "two.localhost",
            ]);
            await writeFile(
                join(root, "caddy.json"),
                JSON.stringify(
                    maintenanceConfiguration(
                        { schema: "ulvia.maintenance-pages/v1", sites, tlsHosts: ["one.localhost", "two.localhost"] },
                        certs,
                    ),
                ),
            );
            const definition = await readFile(
                new URL("../../../../src/runtime/stack/orchestration/definitions/services.yml", import.meta.url),
                "utf8",
            );
            const image = definition.match(/image: (caddy:[^\s]+)/u)![1]!;
            await runCommand([
                "docker",
                "run",
                "--detach",
                "--name",
                name,
                ...frontendArguments(root),
                "--publish",
                `127.0.0.1:${http}:80`,
                "--publish",
                `127.0.0.1:${https}:443`,
                image,
                "caddy",
                "run",
                "--config",
                "/snapshot/caddy.json",
            ]);
            const get = (host: string, path = "/any?secret=input", method = "GET") =>
                fetch(`http://127.0.0.1:${http}${path}`, {
                    method,
                    headers: { host },
                    signal: AbortSignal.timeout(1000),
                });
            await until(async () => {
                try {
                    const response = await get("one.localhost");
                    await response.body?.cancel();
                    return response.status === 503;
                } catch {
                    return false;
                }
            });
            for (const [host, expected] of [
                ["one.localhost", "Site 0"],
                ["alias.localhost", "Site 0"],
                ["two.localhost", "Site 1"],
            ]) {
                const response = await get(host!);
                expect(response.status).toBe(503);
                expect(response.headers.get("retry-after")).toBe("60");
                expect(response.headers.get("cache-control")).toBe("no-store");
                expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
                expect(await response.text()).toContain(expected!);
            }
            expect(await (await get("unknown.localhost")).text()).not.toContain("Site 0");
            expect(await (await get("two.localhost", `/_content/maintenance/${ids[0]}/0`)).text()).not.toContain(
                "color:blue",
            );
            for (const [i, type] of sites[0]!.resources.entries()) {
                const response = await get("one.localhost", `/_content/maintenance/${ids[0]}/${i}`);
                expect(response.status).toBe(200);
                expect(response.headers.get("content-type")).toBe(type);
                await response.body?.cancel();
            }
            const head = await get("one.localhost", "/", "HEAD");
            expect(head.status).toBe(503);
            expect(await head.text()).toBe("");
            const post = await get("one.localhost", "/", "POST");
            expect(post.status).toBe(503);
            expect(await post.json()).toEqual({ error: "installation_maintenance" });
            const ca = await readFile(join(root, "source/test.crt"));
            const tls = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
                const req = request(
                    {
                        hostname: "127.0.0.1",
                        port: https,
                        servername: "one.localhost",
                        headers: { host: "one.localhost" },
                        ca,
                    },
                    (response) => {
                        let body = "";
                        response.on("data", (chunk) => {
                            body += chunk;
                        });
                        response.on("end", () => resolve({ status: response.statusCode, body }));
                    },
                );
                req.on("error", reject);
                req.end();
            });
            expect(tls.status).toBe(503);
            expect(tls.body).toContain("Site 0");
        } finally {
            await runCommand(["docker", "rm", "--force", name], { allowFailure: true });
            await rm(root, { recursive: true, force: true });
        }
    },
    30000,
);
