import { expect, test } from "bun:test";
import { readZip, ZipValidationError } from "../src/exports";
import { fixtureZip } from "./fixtures";

test("reads independent stored/deflated files and explicit empty directories", async () => {
    const input = fixtureZip([
        { path: "docs/readme.md", content: "Hello" },
        { path: "docs/", mode: 0o40755 },
        { path: "assets/émoji-😀.txt", content: "World", compression: 8 },
    ]);
    const result = await readZip(input);
    expect(result.archiveBytes).toBe(input.length);
    expect(result.totalBytes).toBe(10);
    expect(result.entries.map((entry) => entry.path)).toEqual(["docs/readme.md", "assets/émoji-😀.txt"]);
    expect(await Promise.all(result.entries.map((entry) => entry.bytes.text()))).toEqual(["Hello", "World"]);
    expect(Object.isFrozen(result.entries)).toBe(true);
    expect(Object.isFrozen(result.entries[0])).toBe(true);
    expect((await readZip(fixtureZip([]))).entries).toEqual([]);
});

test("rejects duplicate and colliding file/directory paths in either order", async () => {
    for (const paths of [
        ["a", "a"],
        ["a", "a/b"],
        ["a/b", "a"],
        ["a/", "a"],
        ["a", "a/"],
    ]) {
        await expect(
            readZip(fixtureZip(paths.map((path) => ({ path, mode: path.endsWith("/") ? 0o40755 : 0o100644 })))),
        ).rejects.toBeInstanceOf(ZipValidationError);
    }
});

test("rejects unsafe or ambiguous untrusted names", async () => {
    for (const path of [
        "/absolute",
        "../escape",
        "a/../b",
        "a//b",
        "a/./b",
        "C:/file",
        String.raw`a\b`,
        "é.txt",
        "nul\0.txt",
    ]) {
        await expect(readZip(fixtureZip([{ path }]))).rejects.toBeInstanceOf(ZipValidationError);
    }
});

test("refuses encryption, links, special files and unsupported compression", async () => {
    for (const entry of [{ flags: 1, compression: 8 }, { mode: 0o120777 }, { mode: 0o010644 }, { compression: 12 }]) {
        await expect(readZip(fixtureZip([{ path: "file", content: "payload", ...entry }]))).rejects.toMatchObject({
            code: "unsupported_entry",
        });
    }
    await expect(readZip(fixtureZip([{ path: "dir/", mode: 0o40755, content: "hidden" }]))).rejects.toMatchObject({
        code: "invalid_archive",
    });
});

test("checks payload CRC and wraps malformed archives without exposing a partial result", async () => {
    await expect(readZip(fixtureZip([{ path: "file", content: "bytes", checksum: 1 }]))).rejects.toMatchObject({
        code: "integrity_mismatch",
    });
    await expect(readZip(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ code: "invalid_archive" });
    const truncated = fixtureZip([{ path: "file", content: "bytes" }]).subarray(0, 35);
    await expect(readZip(truncated)).rejects.toMatchObject({ code: "invalid_archive" });
});

test("enforces archive, count, entry, aggregate, depth and UTF-8 path budgets", async () => {
    const input = fixtureZip([
        { path: "a", content: "1234" },
        { path: "b", content: "5678" },
    ]);
    for (const limits of [
        { maxArchiveBytes: input.length - 1 },
        { maxEntries: 1 },
        { maxEntryBytes: 3 },
        { maxTotalBytes: 7 },
    ]) {
        await expect(readZip(input, { limits })).rejects.toMatchObject({ code: "limit_exceeded" });
    }
    await expect(readZip(fixtureZip([{ path: "a/b" }]), { limits: { maxDepth: 1 } })).rejects.toMatchObject({
        code: "limit_exceeded",
    });
    await expect(readZip(fixtureZip([{ path: "é" }]), { limits: { maxPathBytes: 1 } })).rejects.toMatchObject({
        code: "limit_exceeded",
    });
    await expect(
        readZip(
            fixtureZip([
                { path: "a/", mode: 0o40755 },
                { path: "b/", mode: 0o40755 },
            ]),
            { limits: { maxEntries: 1 } },
        ),
    ).rejects.toMatchObject({ code: "limit_exceeded" });
});

test("does not trust small declared sizes on compressed expansion", async () => {
    const bomb = fixtureZip([
        { path: "bomb", content: Buffer.alloc(1024 * 1024, 65), compression: 8, declaredSize: 1 },
    ]);
    expect(bomb.length).toBeLessThan(2048);
    await expect(readZip(bomb, { limits: { maxEntryBytes: 32, maxTotalBytes: 32 } })).rejects.toBeInstanceOf(
        ZipValidationError,
    );
});

test("snapshots mutable archive bytes before async work and preserves abort reason", async () => {
    const input = fixtureZip([{ path: "file", content: "original" }]);
    const pending = readZip(input);
    input.fill(0);
    expect(await (await pending).entries[0]?.bytes.text()).toBe("original");
    const controller = new AbortController();
    const reason = new Error("caller canceled");
    controller.abort(reason);
    await expect(readZip(fixtureZip([]), { signal: controller.signal })).rejects.toBe(reason);
});
