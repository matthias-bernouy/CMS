import { describe, expect, test } from "bun:test";
import {
    DEFAULT_CANONICAL_FILE_SET_LIMITS,
    canonicalJsonBytes,
    canonicalizeJson,
    sha256Hex,
    validateIntegrationPackageEnvelope,
} from "@bernouy/cms-integration-packages";
import { readCanonicalFileSetDirectory, readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import { createVersionRoot, readerOptions, writeBytes, writeText } from "./fixtures";

describe("filesystem integration package reader", () => {
    test("reads UTF-8 and binary files into a deterministic digest", async () => {
        const root = createVersionRoot();
        writeText(root, "z-last.txt", "last");
        writeText(root, "a-first.txt", "héllo");
        writeBytes(root, "assets/binary.bin", Uint8Array.of(0, 0xff, 1));

        const first = await readIntegrationPackageDirectory(readerOptions(root));
        const second = await readIntegrationPackageDirectory(readerOptions(root));

        expect(Object.keys(first.envelope.files)).toEqual([
            "a-first.txt",
            "assets/binary.bin",
            "definition.json",
            "release-notes.md",
            "z-last.txt",
        ]);
        expect(first.envelope.files["a-first.txt"]).toEqual({ encoding: "utf8", content: "héllo" });
        expect(first.envelope.files["assets/binary.bin"]).toEqual({ encoding: "base64", content: "AP8B" });
        expect(first.digest).toMatch(/^[a-f0-9]{64}$/);
        expect(second.digest).toBe(first.digest);
        expect(second.canonicalBytes).toEqual(first.canonicalBytes);
        expect(new TextDecoder().decode(first.canonicalBytes)).toBe(canonicalizeJson(first.envelope));
    });

    test("uses the same deterministic walker for generic canonical file sets", async () => {
        const root = createVersionRoot();
        writeText(root, "z-last.txt", "last");
        writeBytes(root, "assets/binary.bin", Uint8Array.of(0, 0xff, 1));
        const packageResult = await readIntegrationPackageDirectory(readerOptions(root));

        const fileSet = await readCanonicalFileSetDirectory(root, DEFAULT_CANONICAL_FILE_SET_LIMITS);

        expect(fileSet).toEqual(packageResult.envelope.files);
        expect(canonicalJsonBytes(fileSet)).toEqual(canonicalJsonBytes(packageResult.envelope.files));
    });

    test("preserves a UTF-8 BOM as package content", async () => {
        const root = createVersionRoot();
        writeBytes(root, "bom.txt", Uint8Array.of(0xef, 0xbb, 0xbf, 0x61));

        const result = await readIntegrationPackageDirectory(readerOptions(root));

        expect(result.envelope.files["bom.txt"]).toEqual({ encoding: "utf8", content: "\ufeffa" });
    });

    test("uses a persisted envelope to preserve an intentional base64 encoding", async () => {
        const root = createVersionRoot();
        writeText(root, "text-as-base64.txt", "text");
        const inferred = await readIntegrationPackageDirectory(readerOptions(root));
        const expectedEnvelope = validateIntegrationPackageEnvelope({
            ...inferred.envelope,
            files: {
                ...inferred.envelope.files,
                "text-as-base64.txt": { encoding: "base64", content: "dGV4dA==" },
            },
        });
        const expectedBytes = canonicalJsonBytes(expectedEnvelope);

        const result = await readIntegrationPackageDirectory({
            ...readerOptions(root),
            expectedEnvelope,
        });

        expect(result.envelope.files["text-as-base64.txt"]).toEqual({ encoding: "base64", content: "dGV4dA==" });
        expect(result.canonicalBytes).toEqual(expectedBytes);
        expect(result.digest).toBe(await sha256Hex(expectedBytes));

        writeText(root, "text-as-base64.txt", "changed");
        await expect(readIntegrationPackageDirectory({ ...readerOptions(root), expectedEnvelope })).rejects.toThrow(
            /differs from its expected envelope/,
        );
    });

    test("supports release-note-less legacy roots only when explicitly selected", async () => {
        const root = createVersionRoot();
        const { releaseNotes: _releaseNotes, ...options } = readerOptions(root);

        await expect(readIntegrationPackageDirectory(options)).rejects.toThrow(/release notes are required/);
        const legacy = await readIntegrationPackageDirectory({ ...options, legacy: true });
        expect(legacy.envelope.releaseNotes).toBeUndefined();
    });

    test("keeps protocol-sensitive property names as ordinary files", async () => {
        const root = createVersionRoot();
        writeText(root, "__proto__", "safe prototype");
        writeText(root, "constructor", "safe constructor");

        const result = await readIntegrationPackageDirectory(readerOptions(root));

        expect(Object.hasOwn(result.envelope.files, "__proto__")).toBeTrue();
        expect(result.envelope.files.__proto__).toEqual({ encoding: "utf8", content: "safe prototype" });
        expect(result.envelope.files.constructor).toEqual({ encoding: "utf8", content: "safe constructor" });
    });

    test("excludes explicitly selected authoring roots from runtime bytes", async () => {
        const root = createVersionRoot();
        writeText(root, "integration.json", '{"kind":"demo"}');
        writeText(root, "tests/checks/runtime.test.ts", "throw new Error('authoring only');");

        const result = await readIntegrationPackageDirectory({
            ...readerOptions(root),
            excludeRootEntries: ["integration.json", "tests"],
        });

        expect(Object.keys(result.envelope.files)).toEqual(["definition.json", "release-notes.md"]);
        await expect(
            readIntegrationPackageDirectory({ ...readerOptions(root), excludeRootEntries: ["../tests"] }),
        ).rejects.toThrow(/single path segment/);
    });

    test("excludes bounded nested authoring subtrees from runtime bytes", async () => {
        const root = createVersionRoot();
        writeText(root, "definitions/artifacts/sources/source.json", "source");
        writeText(root, "definitions/artifacts/dashboards/admin.json", "deferred");

        const result = await readIntegrationPackageDirectory({
            ...readerOptions(root),
            excludePathPrefixes: ["definitions/artifacts/dashboards"],
        });

        expect(Object.keys(result.envelope.files)).toContain("definitions/artifacts/sources/source.json");
        expect(Object.keys(result.envelope.files)).not.toContain("definitions/artifacts/dashboards/admin.json");
        await expect(
            readIntegrationPackageDirectory({ ...readerOptions(root), excludePathPrefixes: ["../dashboards"] }),
        ).rejects.toThrow(/path segment/);
    });
});
