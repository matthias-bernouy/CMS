import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertDevServersStopped, resetDevData } from "../../src/commands/devData";
import { loadOrCreateDevRuntimeConfig } from "../../src/runtime/config";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../src/runtime/paths";

describe("Ulvia development data lifecycle", () => {
    test("resets only Ulvia-owned children and preserves root siblings", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-dev-reset-"));
        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
        try {
            await ensureUlviaPaths(paths);
            await writeFile(join(root, "keep.txt"), "keep");
            await writeFile(join(paths.dev, "runtime.json"), JSON.stringify({ schema: "ulvia.dev-runtime.v1" }));
            await writeFile(join(paths.repository, "release.json"), "old");
            const immutableObject = join(paths.repository, "objects", "sha256", "digest");
            await mkdir(immutableObject, { recursive: true });
            await writeFile(join(immutableObject, "release.json"), "immutable");
            await chmod(immutableObject, 0o550);
            await chmod(join(paths.repository, "objects", "sha256"), 0o550);
            await resetDevData(paths);

            expect(await readFile(join(root, "keep.txt"), "utf8")).toBe("keep");
            expect(await Array.fromAsync(new Bun.Glob("**/*").scan(paths.repository))).toEqual([]);
            expect(await Array.fromAsync(new Bun.Glob("**/*").scan(paths.dev))).toEqual([]);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("refuses to reset an uninitialized or unrecognized directory", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-dev-foreign-"));
        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
        try {
            await ensureUlviaPaths(paths);
            await expect(resetDevData(paths)).rejects.toThrow(/No initialized Ulvia/);
            await writeFile(join(paths.dev, "runtime.json"), JSON.stringify({ schema: "another-application" }));
            await expect(resetDevData(paths)).rejects.toThrow(/unrecognized development data/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("refuses lifecycle changes while a development listener is active", async () => {
        await expect(
            assertDevServersStopped(
                { kernel: 5100, mongo: 27_019, repository: 5102, provider: 5103 },
                async () => true,
            ),
        ).rejects.toThrow(/Stop the active development stack/);
    });

    test("refuses to replace a missing encryption key over persistent MongoDB data", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-dev-orphaned-mongo-"));
        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
        try {
            await ensureUlviaPaths(paths);
            await writeFile(join(paths.mongo, "WiredTiger"), "existing database");
            await expect(loadOrCreateDevRuntimeConfig(paths.dev)).rejects.toThrow(/credentials are missing/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
