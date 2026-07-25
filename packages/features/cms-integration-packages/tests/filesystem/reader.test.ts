import { describe, expect, test } from "bun:test";
import { canonicalizeJson } from "@bernouy/cms-integration-packages";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
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

    test("preserves a UTF-8 BOM as package content", async () => {
        const root = createVersionRoot();
        writeBytes(root, "bom.txt", Uint8Array.of(0xef, 0xbb, 0xbf, 0x61));

        const result = await readIntegrationPackageDirectory(readerOptions(root));

        expect(result.envelope.files["bom.txt"]).toEqual({ encoding: "utf8", content: "\ufeffa" });
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
});
