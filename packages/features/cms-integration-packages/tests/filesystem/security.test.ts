import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import { createVersionRoot, readerOptions, writeText } from "./fixtures";

describe("filesystem integration package confinement", () => {
    test("rejects a symlink root", async () => {
        const root = createVersionRoot();
        const alias = `${root}-alias`;
        symlinkSync(root, alias, "dir");

        await expect(readIntegrationPackageDirectory(readerOptions(alias))).rejects.toThrow(
            /root must not be a symlink/,
        );
    });

    test("rejects nested and broken symlinks", async () => {
        const outside = mkdtempSync(join(tmpdir(), "cms-integration-outside-"));
        writeText(outside, "secret.txt", "outside");
        const nested = createVersionRoot();
        symlinkSync(join(outside, "secret.txt"), join(nested, "linked.txt"), "file");
        await expect(readIntegrationPackageDirectory(readerOptions(nested))).rejects.toThrow(
            /must not contain symlinks/,
        );

        const broken = createVersionRoot();
        symlinkSync(join(outside, "missing.txt"), join(broken, "broken.txt"), "file");
        await expect(readIntegrationPackageDirectory(readerOptions(broken))).rejects.toThrow(
            /must not contain symlinks/,
        );
    });

    test("rejects special files", async () => {
        const root = createVersionRoot();
        const fifo = join(root, "stream.pipe");
        const created = Bun.spawnSync(["mkfifo", fifo]);
        expect(created.exitCode).toBe(0);

        await expect(readIntegrationPackageDirectory(readerOptions(root))).rejects.toThrow(/regular file or directory/);
    });

    test("rejects filesystem names forbidden by the transport protocol", async () => {
        const root = createVersionRoot();
        writeText(root, "ambiguous\\name.txt", "unsafe");

        await expect(readIntegrationPackageDirectory(readerOptions(root))).rejects.toThrow(
            /Invalid integration package path segment/,
        );
    });

    test("rejects a non-directory root", async () => {
        const parent = createVersionRoot();
        const file = join(parent, "definition.json");
        mkdirSync(join(parent, "empty"));

        await expect(readIntegrationPackageDirectory(readerOptions(file))).rejects.toThrow(/root must be a directory/);
    });
});
