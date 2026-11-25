import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runCommand } from "../../../../src/runtime/process";
import { maintenanceConfiguration } from "../../../../src/runtime/maintenance/presentation/configuration";
import { frontendArguments } from "../../../../src/runtime/maintenance/presentation/frontend";
import { selectErrorLanguage } from "@bernouy/http-runner/html";
import { until } from "../upgrade/database";
const native = process.env.ULVIA_RUN_MAINTENANCE_FRONTEND === "1" ? test : test.skip;
native(
    "real maintenance proxy negotiates only code-owned defaults and never evaluates authored content or headers",
    async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-error-languages-"));
        const name = `ulvia-error-languages-${crypto.randomUUID()}`;
        const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
        const port = reservation.port!;
        reservation.stop(true);
        try {
            const custom = "a".repeat(64),
                builtin = "b".repeat(64);
            await mkdir(join(root, "sites", custom), { recursive: true });
            const authored = '<html><p>Custom {{env "HOME"}} {{readFile "secret"}}</p></html>';
            await writeFile(join(root, "sites", custom, "page.html"), authored);
            await writeFile(join(root, "secret"), "private sentinel");
            const pages = {
                schema: "ulvia.maintenance-pages/v1" as const,
                tlsHosts: [],
                sites: [
                    { id: custom, hosts: ["custom.localhost"], resources: [] },
                    { id: builtin, hosts: ["default.localhost"], resources: [] },
                ],
            };
            await writeFile(
                join(root, "caddy.json"),
                JSON.stringify(maintenanceConfiguration(pages, 0, new Set([builtin]))),
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
                `127.0.0.1:${port}:80`,
                image,
                "caddy",
                "run",
                "--config",
                "/snapshot/caddy.json",
            ]);
            const get = (language: string, host = "default.localhost", method = "GET") =>
                fetch(`http://127.0.0.1:${port}/`, {
                    method,
                    headers: { host, "accept-language": language },
                    signal: AbortSignal.timeout(1000),
                });
            await until(async () => {
                try {
                    const response = await get("en");
                    await response.body?.cancel();
                    return response.status === 503;
                } catch {
                    return false;
                }
            });
            for (const [header, language] of [
                ["fr-FR,fr;q=0.9,en;q=0.8", "fr"],
                ["en;q=0.5,fr;q=0.9", "fr"],
                ["fr;q=0,en;q=0.2", "en"],
                ["de,FR-ca;q=0.8", "fr"],
                ["en;q=0.7,fr;q=0.7", "en"],
                ["fr;q=0.7,en;q=0.7", "fr"],
                ["fr;q=wat,en", "en"],
                ["fr;q=0;q=1,en", "en"],
                ["fr;q=1.001,en", "en"],
                ['{{readFile "secret"}}', "en"],
            ]) {
                const response = await get(header!);
                expect(response.status).toBe(503);
                expect(selectErrorLanguage(header)).toBe(language);
                expect(response.headers.get("content-language")).toBe(language);
                expect(response.headers.get("vary")).toContain("Accept-Language");
                const html = await response.text();
                expect(html).toContain(`<html lang="${language}">`);
                expect(html).not.toContain("private sentinel");
            }
            const customResponse = await get("fr", "custom.localhost");
            expect(customResponse.status).toBe(503);
            expect(await customResponse.text()).toBe(authored);
            const head = await get("fr", "default.localhost", "HEAD");
            expect(head.status).toBe(503);
            expect(head.headers.get("content-language")).toBe("fr");
            expect(await head.text()).toBe("");
        } finally {
            await runCommand(["docker", "rm", "--force", name], { allowFailure: true });
            await rm(root, { recursive: true, force: true });
        }
    },
    30000,
);
