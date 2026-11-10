import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalArtifactFiles, LocalCollectionRepository } from "@bernouy/repository/repository/filesystem";
import { runCli } from "../../src/cli";
import { bootstrapOfficialRepository } from "../../src/commands/bootstrap";
import { aggregateStatus } from "../../src/commands/local/deployment/status";
import { resolveUlviaPaths } from "../../src/runtime/paths";
import { resolveServicePorts } from "../../src/runtime/stack/ports";
import { loadInstallationConfig } from "../../src/runtime/stack/installation";

describe("Ulvia CLI", () => {
    test("documents CMS instance deployment and Repository account connections", async () => {
        const output: string[] = [];
        await runCli(["--help"], { log: (line) => output.push(line) });

        expect(output.join("\n")).toContain("ulvia start");
        expect(output.join("\n")).toContain("ulvia release");
        expect(output.join("\n")).toContain("ulvia prune");
        expect(output.join("\n")).toContain("ulvia pull");
        expect(output.join("\n")).toContain("ulvia push");
        expect(output.join("\n")).toContain("ulvia apply");
        expect(output.join("\n")).not.toContain("ulvia services");
        expect(output.join("\n")).toContain("ulvia configure");
        expect(output.join("\n")).toContain("ulvia configure");
        expect(output.join("\n")).not.toContain("ulvia instance create");
        expect(output.join("\n")).toContain("ulvia upgrade [--version");
        expect(output.join("\n")).not.toContain("ulvia dev");
        expect(output.join("\n")).toContain("ulvia reset --yes");
        expect(output.join("\n")).not.toContain("ulvia instance delete");
    });

    test("rejects ambiguous or mutable software upgrade versions before contacting Docker", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-upgrade-arguments-"));
        try {
            await expect(
                runCli(["upgrade", "--version", "latest"], {
                    environment: { ULVIA_DATA_DIR: root },
                    log: () => undefined,
                }),
            ).rejects.toThrow(/Invalid Ulvia image version/);
            await expect(
                runCli(["upgrade", "edge", "1.2.3"], {
                    environment: { ULVIA_DATA_DIR: root },
                    log: () => undefined,
                }),
            ).rejects.toThrow(/Usage: ulvia upgrade/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("persists explicit network exposure and refuses invalid launch state without changing it", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-network-"));
        try {
            await runCli(
                [
                    "configure",
                    "--bind",
                    "0.0.0.0",
                    "--http-port",
                    "80",
                    "--tls",
                    "acme",
                    "--https-port",
                    "443",
                    "--acme-email",
                    "ops@example.com",
                ],
                { environment: { ULVIA_DATA_DIR: root }, log: () => undefined },
            );
            const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
            expect(await loadInstallationConfig(paths)).toMatchObject({
                bindAddress: "0.0.0.0",
                ports: { http: 80 },
                tls: { mode: "acme", httpsPort: 443, email: "ops@example.com" },
            });
            const marker = join(paths.services, "stack.json");
            await writeFile(marker, '{"invalid":"existing launch state"}');
            await expect(
                runCli(["configure", "--http-port", "8080"], {
                    environment: { ULVIA_DATA_DIR: root },
                    log: () => undefined,
                }),
            ).rejects.toThrow(/state is invalid/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("accepts isolated local ports and rejects collisions", () => {
        expect(resolveServicePorts({ ULVIA_HTTP_PORT: "5210", ULVIA_PROVIDER_PORT: "5213" })).toEqual({
            http: 5210,
            provider: 5213,
        });
        expect(() => resolveServicePorts({ ULVIA_HTTP_PORT: "5200", ULVIA_PROVIDER_PORT: "5200" })).toThrow(
            /ports must be distinct/,
        );
    });

    test("distinguishes a stopped local stack from a degraded running stack", () => {
        expect(aggregateStatus([{ service: "edge", state: "exited", health: "" }])).toBe("stopped");
        expect(aggregateStatus([{ service: "edge", state: "running", health: "unhealthy" }])).toBe("degraded");
    });

    test("rejects removed instance commands before initializing installation state", async () => {
        for (const action of ["create", "credentials", "start", "stop", "delete"]) {
            await expect(
                runCli(["instance", action, "site"], {
                    environment: { ULVIA_DATA_DIR: "/unused/ulvia-removed-instance-command" },
                    log: () => undefined,
                }),
            ).rejects.toThrow("Unknown command: instance");
        }
    });

    test("admits all bundled resources needed by a fresh local stack", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-bootstrap-"));
        try {
            await bootstrapOfficialRepository(root);
            const artifacts = new LocalArtifactFiles(root);
            expect((await artifacts.list("contracts")).map(({ id }) => id)).toContain("ulvia/cms.content");
            expect((await artifacts.list("providers")).map(({ id }) => id)).toEqual(["ulvia/primary-provider"]);
            expect(
                (await new LocalCollectionRepository(root).list()).map(({ release }) => release.collectionId),
            ).toEqual([]);
            await bootstrapOfficialRepository(root);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    }, 15_000);

    test("rejects obsolete integration-shaped pull arguments", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-obsolete-pull-"));
        try {
            await expect(
                runCli(["pull", "demo"], {
                    environment: { ULVIA_DATA_DIR: root },
                    log: () => undefined,
                }),
            ).rejects.toThrow("Usage: ulvia pull");
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
