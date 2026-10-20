import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalArtifactFiles, LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { writeOfficialBootstrapArtifacts } from "../../src/bootstrap/generate";
import { runCli } from "../../src/cli";
import { bootstrapOfficialRepository } from "../../src/commands/bootstrap";
import { resolveDevPorts } from "../../src/runtime/dev/ports";
import { localMongoUrl } from "../../src/runtime/mongo";

describe("Ulvia CLI", () => {
    test("documents local development and repository lifecycle commands", async () => {
        const output: string[] = [];
        await runCli(["--help"], { log: (line) => output.push(line) });

        expect(output.join("\n")).toContain("ulvia dev");
        expect(output.join("\n")).toContain("ulvia release");
        expect(output.join("\n")).toContain("ulvia prune");
        expect(output.join("\n")).toContain("ulvia pull");
        expect(output.join("\n")).toContain("ulvia push");
        expect(output.join("\n")).toContain("ulvia dev new");
        expect(output.join("\n")).not.toContain("dev new <absolute-data-directory>");
        expect(output.join("\n")).toContain("ulvia dev reset --yes");
        expect(output.join("\n")).toContain("ulvia dev logs");
    });

    test("accepts isolated dev ports and rejects collisions", () => {
        expect(resolveDevPorts({ ULVIA_DEV_KERNEL_PORT: "5210" })).toEqual({
            kernel: 5210,
            mongo: 27019,
            repository: 5102,
            provider: 5103,
        });
        expect(() => resolveDevPorts({ ULVIA_DEV_KERNEL_PORT: "5200", ULVIA_DEV_REPOSITORY_PORT: "5200" })).toThrow(
            /ports must be distinct/,
        );
        expect(() => resolveDevPorts({ ULVIA_DEV_MONGO_PORT: "70000" })).toThrow(/between 1 and 65535/);
        expect(() => resolveDevPorts({ ULVIA_DEV_PROVIDER_PORT: "5213" })).toThrow(/official Provider origin/);
    });

    test("disables retryable writes for the standalone local MongoDB", () => {
        expect(localMongoUrl(27_019)).toBe("mongodb://127.0.0.1:27019/ulvia_dev?retryWrites=false");
    });

    test("does not print technical tokens with development credentials", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-credentials-"));
        const token = "a".repeat(43);
        try {
            await runCli(["dev", "credentials"], {
                environment: { ULVIA_DATA_DIR: root },
                log: () => undefined,
            });
            await writeFile(
                join(root, "dev", "instance.json"),
                JSON.stringify({
                    schema: "ulvia.local-instance.v1",
                    instanceId: "instance:00000000-0000-4000-8000-000000000001",
                    token,
                }),
            );
            const output: string[] = [];
            await runCli(["dev", "credentials"], {
                environment: { ULVIA_DATA_DIR: root },
                log: (line) => output.push(line),
            });

            expect(output.join("\n")).not.toContain(token);
            expect(output.join("\n")).not.toContain("Instance token:");
            expect(output.join("\n")).toContain(join(root, "dev"));
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
            expect((await artifacts.list("contracts")).map(({ id }) => id)).toContain("ulvia.cms.pages");
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
