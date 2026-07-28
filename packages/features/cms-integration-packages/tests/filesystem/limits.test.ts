import { describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_INTEGRATION_PACKAGE_LIMITS } from "@bernouy/cms-integration-packages";
import { readBoundedRegularFile, readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import { readBoundedFileHandle } from "../../src/default-implementation/fs/boundedFile";
import { createVersionRoot, readerOptions, writeText } from "./fixtures";

describe("filesystem integration package limits", () => {
    test("enforces file and actual decoded-byte limits", async () => {
        const root = createVersionRoot();
        writeText(root, "extra.txt", "extra");
        await expect(
            readIntegrationPackageDirectory({ ...readerOptions(root), limits: { maxFiles: 2 } }),
        ).rejects.toThrow(/exceeds 2 files/);

        const handle = growingHandle(Uint8Array.of(1, 2));
        await expect(
            readBoundedFileHandle(handle, "growing.bin", 0, {
                ...DEFAULT_INTEGRATION_PACKAGE_LIMITS,
                maxFileBytes: 1,
            }),
        ).rejects.toThrow(/exceeds 1 decoded bytes/);
    });

    test("enforces total bytes independently of each file size", async () => {
        const root = createVersionRoot();
        await expect(
            readIntegrationPackageDirectory({
                ...readerOptions(root),
                limits: { maxFileBytes: 1_024, maxDecodedBytes: 70 },
            }),
        ).rejects.toThrow(/contents exceed 70 decoded bytes/);
    });

    test("exposes the bounded regular-file reader through the filesystem adapter", async () => {
        const root = createVersionRoot();
        const bytes = await readBoundedRegularFile(join(root, "definition.json"), 0, {
            ...DEFAULT_INTEGRATION_PACKAGE_LIMITS,
            maxFileBytes: 1_024,
            maxDecodedBytes: 1_024,
        });

        expect(new TextDecoder().decode(bytes)).toContain('"kind":"demo"');
    });

    test("bounds empty directories, depth, path bytes, and segment bytes", async () => {
        const directories = createVersionRoot();
        mkdirSync(join(directories, "a"));
        mkdirSync(join(directories, "b"));
        await expect(
            readIntegrationPackageDirectory({ ...readerOptions(directories), limits: { maxDirectories: 2 } }),
        ).rejects.toThrow(/exceeds 2 directories/);

        const depth = createVersionRoot();
        writeText(depth, "a/b/deep.txt", "deep");
        await expect(
            readIntegrationPackageDirectory({ ...readerOptions(depth), limits: { maxDepth: 2 } }),
        ).rejects.toThrow(/exceeds depth 2/);

        const segment = createVersionRoot();
        writeText(segment, "long-name.txt", "long");
        await expect(
            readIntegrationPackageDirectory({ ...readerOptions(segment), limits: { maxSegmentBytes: 8 } }),
        ).rejects.toThrow(/segment exceeds 8 UTF-8 bytes/);

        const path = createVersionRoot();
        writeText(path, "nested/name.txt", "long");
        await expect(
            readIntegrationPackageDirectory({ ...readerOptions(path), limits: { maxPathBytes: 14 } }),
        ).rejects.toThrow(/path exceeds 14 UTF-8 bytes/);
    });

    test("bounds the canonical envelope as well as decoded contents", async () => {
        const root = createVersionRoot();
        await expect(
            readIntegrationPackageDirectory({ ...readerOptions(root), limits: { maxDocumentBytes: 100 } }),
        ).rejects.toThrow(/document exceeds 100 bytes/);
    });

    test("bounds directory fanout before sorting entries", async () => {
        const root = createVersionRoot();
        writeText(root, "a.txt", "a");
        writeText(root, "b.txt", "b");
        writeText(root, "c.txt", "c");

        await expect(
            readIntegrationPackageDirectory({
                ...readerOptions(root),
                limits: { maxFiles: 2, maxDirectories: 2 },
            }),
        ).rejects.toThrow(/remaining file and directory limits/);
    });
});

function growingHandle(bytes: Uint8Array) {
    let read = false;
    return {
        stat: async () => ({ isFile: () => true, size: 1 }),
        read: async (buffer: Uint8Array) => {
            if (read) {
                return { bytesRead: 0, buffer };
            }
            read = true;
            buffer.set(bytes);
            return { bytesRead: bytes.byteLength, buffer };
        },
    };
}
