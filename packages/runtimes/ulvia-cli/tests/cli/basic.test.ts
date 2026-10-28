import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalArtifactFiles, LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { writeOfficialBootstrapArtifacts } from "../../src/bootstrap/generate";
import { runCli } from "../../src/cli";
import { bootstrapOfficialRepository } from "../../src/commands/bootstrap";
import { aggregateStatus } from "../../src/commands/local/services";
import { loadOrCreateLocalInstanceConfig } from "../../src/runtime/instanceConfig";
import { saveLocalInstanceConnection } from "../../src/runtime/instanceConnection";
import { ensureLocalInstancePaths, resolveLocalInstancePaths, resolveUlviaPaths } from "../../src/runtime/paths";
import { resolveServicePorts } from "../../src/runtime/stack/ports";
import { loadInstallationConfig } from "../../src/runtime/stack/installation";

describe("Ulvia CLI", () => {
    test("documents local installation and repository lifecycle commands", async () => {
        const output: string[] = [];
        await runCli(["--help"], { log: (line) => output.push(line) });

        expect(output.join("\n")).toContain("ulvia start");
        expect(output.join("\n")).toContain("ulvia release");
        expect(output.join("\n")).toContain("ulvia prune");
        expect(output.join("\n")).toContain("ulvia pull");
        expect(output.join("\n")).toContain("ulvia push");
        expect(output.join("\n")).toContain("ulvia services");
        expect(output.join("\n")).toContain("ulvia configure network");
        expect(output.join("\n")).toContain("ulvia instance create");
        expect(output.join("\n")).toContain("ulvia upgrade <edge | provider | repository>");
        expect(output.join("\n")).not.toContain("ulvia dev");
        expect(output.join("\n")).toContain("ulvia reset --yes");
        expect(output.join("\n")).toContain("ulvia instance delete");
    });

    test("rejects ambiguous or mutable software upgrade versions before contacting Docker", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-upgrade-arguments-"));
        try {
            await expect(
                runCli(["upgrade", "edge", "--version", "latest"], {
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

    test("persists explicit network exposure and locks it after an instance exists", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-network-"));
        try {
            await runCli(
                [
                    "configure",
                    "network",
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
            const instance = resolveLocalInstancePaths(paths, "site");
            await ensureLocalInstancePaths(instance);
            await loadOrCreateLocalInstanceConfig(instance.root, {
                name: "site",
                label: "Site",
                hostname: "example.com",
            });
            await expect(
                runCli(["configure", "network", "--http-port", "8080"], {
                    environment: { ULVIA_DATA_DIR: root },
                    log: () => undefined,
                }),
            ).rejects.toThrow(/locked after the first instance/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("accepts isolated local ports and rejects collisions", () => {
        expect(resolveServicePorts({ ULVIA_HTTP_PORT: "5210", ULVIA_PROVIDER_PORT: "5213" })).toEqual({
            http: 5210,
            repository: 5102,
            provider: 5213,
        });
        expect(() => resolveServicePorts({ ULVIA_HTTP_PORT: "5200", ULVIA_REPOSITORY_PORT: "5200" })).toThrow(
            /ports must be distinct/,
        );
    });

    test("distinguishes a stopped local stack from a degraded running stack", () => {
        expect(aggregateStatus([{ service: "edge", state: "exited", health: "" }])).toBe("stopped");
        expect(aggregateStatus([{ service: "edge", state: "running", health: "unhealthy" }])).toBe("degraded");
    });

    test("does not print technical tokens with local administrator credentials", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-credentials-"));
        const token = "a".repeat(43);
        try {
            const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
            const instance = resolveLocalInstancePaths(paths, "default");
            await ensureLocalInstancePaths(instance);
            await loadOrCreateLocalInstanceConfig(instance.root, {
                name: "default",
                label: "Default Ulvia instance",
                hostname: "localhost",
            });
            await saveLocalInstanceConnection(instance.root, {
                instanceId: "instance:00000000-0000-4000-8000-000000000001",
                token,
            });
            const output: string[] = [];
            await runCli(["instance", "credentials", "default"], {
                environment: { ULVIA_DATA_DIR: root },
                log: (line) => output.push(line),
            });

            expect(output.join("\n")).not.toContain(token);
            expect(output.join("\n")).not.toContain("Instance token:");
            expect(output.join("\n")).toContain(join(root, "instances", "default"));
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("admits all bundled resources needed by a fresh local stack", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-bootstrap-"));
        const bundle = await mkdtemp(join(tmpdir(), "ulvia-bootstrap-bundle-"));
        try {
            await writeOfficialBootstrapArtifacts(bundle);
            await bootstrapOfficialRepository(root, bundle);
            const artifacts = new LocalArtifactFiles(root);
            expect((await artifacts.list("contracts")).map(({ id }) => id)).toContain("ulvia.cms.content");
            expect((await artifacts.list("providers")).map(({ id }) => id)).toEqual(["ulvia.official"]);
            expect(
                (await new LocalCollectionRepository(root).list()).map(({ release }) => release.collectionId),
            ).toEqual(["ulvia-official"]);
            await bootstrapOfficialRepository(root, bundle);
        } finally {
            await rm(root, { recursive: true, force: true });
            await rm(bundle, { recursive: true, force: true });
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
