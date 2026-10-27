import { describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetLocalData } from "../../src/commands/local/reset";
import { loadOrCreateLocalServicesConfig } from "../../src/runtime/config";
import { ensureUlviaPaths, resolveUlviaPaths } from "../../src/runtime/paths";

describe("Ulvia local data lifecycle", () => {
    test("resets only Ulvia-owned children and preserves root siblings", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-stack-reset-"));
        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
        try {
            await ensureUlviaPaths(paths);
            await writeFile(join(root, "keep.txt"), "keep");
            await writeFile(
                join(paths.services, "runtime.json"),
                JSON.stringify({ schema: "ulvia.local-services.v1" }),
            );
            await writeFile(join(paths.repository, "release.json"), "old");
            const immutableObject = join(paths.repository, "objects", "sha256", "digest");
            await mkdir(immutableObject, { recursive: true });
            await writeFile(join(immutableObject, "release.json"), "immutable");
            await chmod(immutableObject, 0o550);
            await chmod(join(paths.repository, "objects", "sha256"), 0o550);
            await resetLocalData(paths);

            expect(await readFile(join(root, "keep.txt"), "utf8")).toBe("keep");
            expect(await Array.fromAsync(new Bun.Glob("**/*").scan(paths.repository))).toEqual([]);
            expect(await Array.fromAsync(new Bun.Glob("**/*").scan(paths.services))).toEqual([]);
            expect(await Array.fromAsync(new Bun.Glob("**/*").scan(paths.instances))).toEqual([]);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("allows an empty reset but rejects unrecognized runtime data", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-stack-foreign-"));
        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
        try {
            await ensureUlviaPaths(paths);
            await resetLocalData(paths);
            await writeFile(join(paths.services, "runtime.json"), JSON.stringify({ schema: "another-application" }));
            await expect(resetLocalData(paths)).rejects.toThrow(/unrecognized Ulvia data/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("resets an instance directory left empty by an interrupted creation", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-stack-partial-instance-"));
        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
        try {
            await ensureUlviaPaths(paths);
            await mkdir(join(paths.instances, "preview"), { recursive: true });

            await resetLocalData(paths);

            expect(await Array.fromAsync(new Bun.Glob("**/*").scan(paths.instances))).toEqual([]);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    test("refuses to replace a missing encryption key over persistent MongoDB data", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-stack-orphaned-mongo-"));
        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
        try {
            await ensureUlviaPaths(paths);
            await writeFile(join(paths.mongo, "WiredTiger"), "existing database");
            await expect(loadOrCreateLocalServicesConfig(paths.services)).rejects.toThrow(/credentials are missing/);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
