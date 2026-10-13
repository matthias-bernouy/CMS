import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertDevServersStopped, createFreshDevPaths, resetDevData } from "../../src/commands/devData";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../src/runtime/paths";

describe("Ulvia development data lifecycle", () => {
    test("creates a separate empty environment without changing the current one", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-dev-new-"));
        const current = resolveUlviaPaths({ ULVIA_DATA_DIR: join(root, "current") });
        const target = join(root, "fresh");
        try {
            const fresh = await createFreshDevPaths(target, current);

            expect(fresh.data).toBe(target);
            expect((await stat(fresh.dev)).isDirectory()).toBe(true);
            expect((await stat(fresh.repository)).isDirectory()).toBe(true);
            await expect(createFreshDevPaths(target, current)).rejects.toThrow(/already exists/);
            await expect(createFreshDevPaths(current.data, current)).rejects.toThrow(/must differ/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("resets only Ulvia-owned children and preserves root siblings", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-dev-reset-"));
        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
        try {
            await ensureUlviaPaths(paths);
            await writeFile(join(root, "keep.txt"), "keep");
            await writeFile(join(paths.dev, "runtime.json"), JSON.stringify({ schema: "ulvia.dev-runtime.v1" }));
            await writeFile(join(paths.repository, "release.json"), "old");
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
});
