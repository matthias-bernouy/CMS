import { describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureUlviaPaths, resolveUlviaPaths } from "../src/runtime/paths";

describe("Ulvia persistent data paths", () => {
    test("prefers the explicit application data directory", () => {
        const paths = resolveUlviaPaths(
            { ULVIA_DATA_DIR: "/var/tmp/ulvia-data", XDG_DATA_HOME: "/ignored" },
            "/home/u",
        );

        expect(paths.data).toBe("/var/tmp/ulvia-data");
        expect(paths.repository).toBe("/var/tmp/ulvia-data/repository");
        expect(paths.services).toBe("/var/tmp/ulvia-data/services");
        expect(paths.mongo).toBe("/var/tmp/ulvia-data/services/mongo");
        expect(paths.instances).toBe("/var/tmp/ulvia-data/instances");
    });

    test("uses the XDG data home before the home fallback", () => {
        expect(resolveUlviaPaths({ XDG_DATA_HOME: "/data" }, "/home/u").data).toBe("/data/ulvia");
        expect(resolveUlviaPaths({}, "/home/u").data).toBe("/home/u/.local/share/ulvia");
    });

    test("rejects relative application data roots", () => {
        expect(() => resolveUlviaPaths({ ULVIA_DATA_DIR: "./data" }, "/home/u")).toThrow(/absolute path/);
        expect(() => resolveUlviaPaths({ XDG_DATA_HOME: "data" }, "/home/u")).toThrow(/absolute path/);
    });

    test("keeps existing local data directories private", async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia-private-paths-"));
        try {
            await chmod(root, 0o755);
            const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
            await ensureUlviaPaths(paths);
            expect((await stat(root)).mode & 0o777).toBe(0o700);
            expect((await stat(paths.services)).mode & 0o777).toBe(0o700);
            expect((await stat(paths.instances)).mode & 0o777).toBe(0o700);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });
});
